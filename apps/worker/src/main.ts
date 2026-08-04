import { createPrismaClient } from "@fleet/database";
import { randomUUID } from "node:crypto";

const instanceId = process.env.WORKER_INSTANCE_ID ?? "worker-local-1";
const prisma = createPrismaClient();

async function recoverExpiredReset(): Promise<void> {
  const now = new Date();
  const expired = await prisma.demoResetExecution.findFirst({
    where: {
      status: { in: ["RUNNING", "RECOVERING"] },
      leaseExpiresAt: { lt: now }
    },
    orderBy: { requestedAt: "asc" }
  });
  if (!expired) return;

  await prisma.$transaction(async (transaction) => {
    await transaction.demoResetExecution.update({
      where: { id: expired.id },
      data: {
        status: "FAILED",
        failedAt: now,
        failureCode: "RESET_OWNER_LOST_RECOVERED_TO_SOURCE",
        recoveryAttemptCount: { increment: 1 },
        lastRecoveryStartedAt: now,
        recoveredByInstanceId: instanceId,
        leaseOwnerInstanceId: null,
        leaseExpiresAt: null
      }
    });
    await transaction.demoGeneration.update({
      where: { id: expired.sourceGenerationId },
      data: { status: "ACTIVE", retiredAt: null }
    });
    await transaction.demoGeneration.update({
      where: { id: expired.targetGenerationId },
      data: { status: "FAILED", failedAt: now, failureCode: "RESET_OWNER_LOST" }
    });
    const runtime = await transaction.demoRuntimeControl.findUnique({ where: { singletonKey: true } });
    await transaction.demoRuntimeControl.update({
      where: { singletonKey: true },
      data: {
        activeGenerationId: expired.sourceGenerationId,
        runtimeStatus: "ACTIVE",
        resetExecutionId: null,
        updatedAt: now,
        version: { increment: 1 }
      }
    });
    for (const actionCode of [
      "DEMO_RESET_HEARTBEAT_EXPIRED",
      "DEMO_RESET_RECOVERY_STARTED",
      "DEMO_RESET_RECOVERED_TO_SOURCE"
    ]) {
      await transaction.securityAuditRecord.create({
        data: {
          id: randomUUID(),
          demoGenerationId: expired.sourceGenerationId,
          actorType: "SYSTEM",
          actorId: null,
          actionCode,
          resourceType: "DEMO_RESET",
          resourceId: expired.id,
          decision: "ALLOW",
          reasonCode: "RESET_WATCHDOG",
          metadata: { worker_instance_id: instanceId, previous_runtime_version: runtime?.version ?? null },
          occurredAt: now
        }
      });
    }
  });
}

async function heartbeat(): Promise<void> {
  const runtime = await prisma.demoRuntimeControl.findUnique({ where: { singletonKey: true } });
  if (!runtime) return;
  const now = new Date();
  await prisma.workerLease.upsert({
    where: { leaseCode: "g1-reset-watchdog" },
    create: {
      leaseCode: "g1-reset-watchdog",
      ownerInstanceId: instanceId,
      demoGenerationId: runtime.activeGenerationId,
      claimedAt: now,
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + 30_000)
    },
    update: {
      ownerInstanceId: instanceId,
      demoGenerationId: runtime.activeGenerationId,
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + 30_000)
    }
  });
}

async function tick(): Promise<void> {
  try {
    await heartbeat();
    await recoverExpiredReset();
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        level: "error",
        message: "G1 reset watchdog failed",
        instance_id: instanceId,
        error_code: error instanceof Error ? error.name : "UNKNOWN_ERROR"
      }) + "\n"
    );
  }
}

process.stdout.write(
  JSON.stringify({
    level: "info",
    message: "G1 worker started",
    instance_id: instanceId,
    demo_mode: process.env.DEMO_MODE === "true"
  }) + "\n"
);

const interval = setInterval(() => void tick(), 15_000);
void tick();

async function shutdown(): Promise<void> {
  clearInterval(interval);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
