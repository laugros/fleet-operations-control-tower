import { Controller, Get, Headers, Res, ServiceUnavailableException } from "@nestjs/common";
import type { Response } from "express";
import { randomUUID } from "node:crypto";

import { PrismaService } from "../database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  getLiveness(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): { status: "UP" } {
    response.setHeader("X-Correlation-ID", correlationId ?? randomUUID());
    return { status: "UP" };
  }

  @Get("ready")
  async getReadiness(
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<{
    status: "UP";
    checks: Record<"database" | "migrations" | "worker" | "seed", "UP">;
  }> {
    const resolvedCorrelationId = correlationId ?? randomUUID();
    response.setHeader("X-Correlation-ID", resolvedCorrelationId);
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      const [manifest, workerLease] = await Promise.all([
        this.prisma.client.demoSeedManifest.findFirst({ where: { isActive: true } }),
        this.prisma.client.workerLease.findUnique({ where: { leaseCode: "g1-reset-watchdog" } })
      ]);
      if (!manifest || !workerLease || workerLease.expiresAt <= new Date()) {
        throw new Error("Active G1 seed or worker heartbeat is missing");
      }
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: "SERVICE_NOT_READY",
          message: "The G1 environment is not ready",
          details: [],
          correlation_id: resolvedCorrelationId
        }
      });
    }
    return {
      status: "UP",
      checks: {
        database: "UP",
        migrations: "UP",
        worker: "UP",
        seed: "UP"
      }
    };
  }
}
