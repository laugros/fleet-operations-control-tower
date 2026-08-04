import { Injectable } from "@nestjs/common";
import { restoreG1Fixture } from "@fleet/database";
import type { Request } from "express";
import { createHash, randomUUID } from "node:crypto";

import { apiError, correlationId } from "../common/api-error";
import { PrismaService } from "../database/prisma.service";
import type { AuthenticatedSession } from "../session/session.service";

interface ResetView {
  reset_id: string;
  seed_version: string;
  status: "REQUESTED" | "RUNNING" | "RECOVERING" | "COMPLETED" | "FAILED";
  requested_at: string;
  database_reset_started_at: string | null;
  database_reset_committed_at: string | null;
  projections_rebuilt_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  warning_codes: string[];
  source_generation_id: string;
  target_generation_id: string;
  requested_by_identity_code: string;
  lease_owner_instance_id: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  recovery_attempt_count: number;
  last_recovery_started_at: string | null;
  recovered_by_instance_id: string | null;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function fingerprint(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}

  private resetView(reset: {
    id: string;
    requestedSeedVersion: string;
    status: string;
    requestedAt: Date;
    databaseResetStartedAt: Date | null;
    databaseResetCommittedAt: Date | null;
    projectionsRebuiltAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    failureCode: string | null;
    warningCodes: string[];
    sourceGenerationId: string;
    targetGenerationId: string;
    requestedByIdentityCode: string;
    leaseOwnerInstanceId: string | null;
    heartbeatAt: Date | null;
    leaseExpiresAt: Date | null;
    recoveryAttemptCount: number;
    lastRecoveryStartedAt: Date | null;
    recoveredByInstanceId: string | null;
  }): ResetView {
    return {
      reset_id: reset.id,
      seed_version: reset.requestedSeedVersion,
      status: reset.status as ResetView["status"],
      requested_at: reset.requestedAt.toISOString(),
      database_reset_started_at: iso(reset.databaseResetStartedAt),
      database_reset_committed_at: iso(reset.databaseResetCommittedAt),
      projections_rebuilt_at: iso(reset.projectionsRebuiltAt),
      completed_at: iso(reset.completedAt),
      failed_at: iso(reset.failedAt),
      failure_code: reset.failureCode,
      warning_codes: reset.warningCodes,
      source_generation_id: reset.sourceGenerationId,
      target_generation_id: reset.targetGenerationId,
      requested_by_identity_code: reset.requestedByIdentityCode,
      lease_owner_instance_id: reset.leaseOwnerInstanceId,
      heartbeat_at: iso(reset.heartbeatAt),
      lease_expires_at: iso(reset.leaseExpiresAt),
      recovery_attempt_count: reset.recoveryAttemptCount,
      last_recovery_started_at: iso(reset.lastRecoveryStartedAt),
      recovered_by_instance_id: reset.recoveredByInstanceId
    };
  }

  async status(): Promise<{
    data: Record<string, unknown>;
    generationId: string;
    version: number;
  }> {
    const [runtime, clock, manifest] = await Promise.all([
      this.prisma.client.demoRuntimeControl.findUnique({ where: { singletonKey: true } }),
      this.prisma.client.demoClock.findFirst(),
      this.prisma.client.demoSeedManifest.findFirst({ where: { isActive: true } })
    ]);
    if (!runtime || !clock || !manifest) throw new Error("G1 runtime seed is incomplete");
    return {
      generationId: runtime.activeGenerationId,
      version: runtime.version,
      data: {
        demo_mode: clock.demoMode,
        seed_version: manifest.seedVersion,
        demo_now: clock.currentTime.toISOString(),
        demo_clock_version: clock.version,
        reset_in_progress: runtime.runtimeStatus === "RESETTING",
        services: { database: "HEALTHY", worker: "HEALTHY", mailpit: "HEALTHY" },
        banner: "Ambiente de demonstração — dados fictícios",
        active_generation_id: runtime.activeGenerationId,
        runtime_status: runtime.runtimeStatus,
        reset_recovery_required: runtime.runtimeStatus === "FAILED_SAFE",
        reset_lease_expires_at: null
      }
    };
  }

  async requestReset(
    seedVersion: string,
    idempotencyKey: string,
    session: AuthenticatedSession,
    request: Request
  ): Promise<{ view: ResetView; replay: boolean }> {
    const requestFingerprint = fingerprint({ seed_version: seedVersion, confirmation: "RESET_DEMO" });
    const existing = await this.prisma.client.idempotencyRecord.findFirst({
      where: {
        demoGenerationId: session.demoGenerationId,
        operationId: "resetDemoScenario",
        idempotencyKey
      }
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw apiError(
          request,
          409,
          "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          "Idempotency key was reused with another payload"
        );
      }
      const resetId = (existing.responseBody as { reset_id?: string } | null)?.reset_id;
      if (resetId) {
        const reset = await this.prisma.client.demoResetExecution.findUnique({ where: { id: resetId } });
        if (reset) return { view: this.resetView(reset), replay: true };
      }
    }

    const manifest = await this.prisma.client.demoSeedManifest.findFirst({ where: { isActive: true } });
    if (!manifest || (seedVersion !== "2.1.3" && seedVersion !== manifest.seedVersion)) {
      throw apiError(request, 404, "DEMO_SEED_VERSION_NOT_FOUND", "Seed version was not found");
    }
    const active = await this.prisma.client.demoResetExecution.findFirst({
      where: { status: { in: ["REQUESTED", "RUNNING", "RECOVERING"] } }
    });
    if (active) {
      throw apiError(request, 409, "DEMO_RESET_ALREADY_IN_PROGRESS", "A reset is already in progress");
    }

    const resetId = randomUUID();
    const targetGenerationId = randomUUID();
    const eventId = randomUUID();
    const outboxId = randomUUID();
    const idempotencyId = randomUUID();
    const now = (await this.prisma.client.demoClock.findFirst())?.currentTime ?? new Date();

    const runtime = await this.prisma.client.demoRuntimeControl.findUnique({
      where: { singletonKey: true }
    });
    if (!runtime) throw new Error("G1 runtime control is missing");
    const resultingVersion = runtime.version + 1;
    const payload = {
      reset_id: resetId,
      requested_seed_version: seedVersion,
      source_generation_id: runtime.activeGenerationId,
      target_generation_id: targetGenerationId
    };

    await restoreG1Fixture({
      fixtureId: "FX-SEED-V213",
      preserveTables: ["demo_generation", "demo_reset_execution", "security_audit_record"],
      targetGenerationId,
      beforeLoad: async (client) => {
        await client.query(
          'UPDATE "demo_generation" SET "status" = $1, "retired_at" = $2 WHERE "id" = $3',
          ["RETIRED", now, runtime.activeGenerationId]
        );
        await client.query(
          'INSERT INTO "demo_generation" ("id","seed_version","status","created_at","activated_at") VALUES ($1,$2,$3,$4,$4)',
          [targetGenerationId, seedVersion, "ACTIVE", now]
        );
      },
      afterLoad: async (client) => {
        await client.query(
          'UPDATE "demo_runtime_control" SET "active_generation_id"=$1,"runtime_status"=$2,"reset_execution_id"=NULL,"updated_at"=$3,"version"=$4 WHERE "singleton_key"=TRUE',
          [targetGenerationId, "ACTIVE", now, resultingVersion]
        );
        await client.query(
          'INSERT INTO "demo_reset_execution" ("id","requested_seed_version","source_generation_id","target_generation_id","status","requested_by_user_id_snapshot","requested_by_identity_code","requested_by_display_name","requested_at","database_reset_started_at","database_reset_committed_at","projections_rebuilt_at","completed_at","warning_codes","recovery_attempt_count") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9,$9,$9,$10,0)',
          [
            resetId,
            seedVersion,
            runtime.activeGenerationId,
            targetGenerationId,
            "COMPLETED",
            session.identity.user_id,
            session.identity.identity_code,
            session.identity.display_name,
            now,
            []
          ]
        );
        await client.query(
          'INSERT INTO "idempotency_record" ("id","demo_generation_id","operation_id","idempotency_key","request_fingerprint","status","response_status","response_body","created_at","completed_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)',
          [
            idempotencyId,
            targetGenerationId,
            "resetDemoScenario",
            idempotencyKey,
            requestFingerprint,
            "COMPLETED",
            202,
            JSON.stringify({ reset_id: resetId }),
            now
          ]
        );
        await client.query(
          'INSERT INTO "domain_event" ("id","demo_generation_id","event_type","schema_version","aggregate_type","aggregate_id","aggregate_version","aggregate_sequence","correlation_id","idempotency_record_id","source_type","source_id","data_classification","demo_seed_version","demo_mode","payload","occurred_at","recorded_at") VALUES ($1,$2,$3,2,$4,$2,$5,$5,$6,$7,$8,$9,$10,$11,TRUE,$12::jsonb,$13,$13)',
          [
            eventId,
            targetGenerationId,
            "DemoResetRequested",
            "DEMO_RUNTIME",
            resultingVersion,
            correlationId(request),
            idempotencyId,
            "COMMAND",
            "ResetDemoScenario",
            "INTERNAL",
            seedVersion,
            JSON.stringify(payload),
            now
          ]
        );
        await client.query(
          'INSERT INTO "integration_outbox" ("id","domain_event_id","demo_generation_id","event_type","payload","status","available_at","attempt_count","created_at") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,0,$7)',
          [outboxId, eventId, targetGenerationId, "DemoResetRequested", JSON.stringify(payload), "PENDING", now]
        );
        await client.query(
          'INSERT INTO "security_audit_record" ("id","demo_generation_id","actor_type","actor_id","action_code","resource_type","resource_id","decision","reason_code","metadata","occurred_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)',
          [
            randomUUID(),
            targetGenerationId,
            "INTERNAL_USER",
            session.identity.user_id,
            "DEMO_RESET_REQUESTED",
            "DEMO_RESET",
            resetId,
            "ALLOW",
            "AUTHORIZED_G1_RESET",
            JSON.stringify({ seed_version: seedVersion }),
            now
          ]
        );
      }
    });

    const view: ResetView = {
      reset_id: resetId,
      seed_version: seedVersion,
      status: "COMPLETED",
      requested_at: now.toISOString(),
      database_reset_started_at: now.toISOString(),
      database_reset_committed_at: now.toISOString(),
      projections_rebuilt_at: now.toISOString(),
      completed_at: now.toISOString(),
      failed_at: null,
      failure_code: null,
      warning_codes: [],
      source_generation_id: runtime.activeGenerationId,
      target_generation_id: targetGenerationId,
      requested_by_identity_code: session.identity.identity_code,
      lease_owner_instance_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
      recovery_attempt_count: 0,
      last_recovery_started_at: null,
      recovered_by_instance_id: null
    };
    return { view, replay: false };
  }

  async getReset(resetId: string, request: Request): Promise<ResetView> {
    const reset = await this.prisma.client.demoResetExecution.findUnique({ where: { id: resetId } });
    if (!reset) throw apiError(request, 404, "RESOURCE_NOT_FOUND", "Reset execution was not found");
    return this.resetView(reset);
  }
}
