import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { apiError } from "../common/api-error";
import { PrismaService } from "../database/prisma.service";

export interface IdentityView {
  user_id: string;
  identity_code: string;
  display_name: string;
  role_code:
    | "ROLE_DEMO_ATTENDANT"
    | "ROLE_DEMO_OPERATIONS_ANALYST"
    | "ROLE_DEMO_SUPERVISOR"
    | "ROLE_DEMO_MANAGER"
    | "ROLE_DEMO_ADMIN";
  permissions: string[];
  scopes: Array<{
    scope_type: "OPERATING_UNIT" | "CUSTOMER" | "TEAM";
    scope_id: string;
    display_name: string;
  }>;
}

export interface AuthenticatedSession {
  sessionId: string;
  csrfTokenHash: string;
  demoGenerationId: string;
  identity: IdentityView;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPermission(code: string): string {
  const aliases: Record<string, string> = {
    "demo.clock.advance": "demo.advance_clock",
    "demo.status.read": "demo.read_status"
  };
  return aliases[code] ?? code;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private async demoNow(): Promise<Date> {
    const clock = await this.prisma.client.demoClock.findFirst();
    return clock?.currentTime ?? new Date();
  }

  private async identity(userId: string): Promise<IdentityView> {
    const user = await this.prisma.client.appUser.findUnique({ where: { id: userId } });
    const userRole = await this.prisma.client.userRole.findUnique({ where: { userId } });
    if (!user || !userRole) throw new Error("Seeded IAM identity is incomplete");
    const role = await this.prisma.client.role.findUnique({ where: { id: userRole.roleId } });
    if (!role) throw new Error("Seeded IAM role is incomplete");

    const rolePermissions = await this.prisma.client.rolePermission.findMany({
      where: { roleId: role.id }
    });
    const permissions = await this.prisma.client.permission.findMany({
      where: { id: { in: rolePermissions.map((grant) => grant.permissionId) } },
      orderBy: { code: "asc" }
    });

    const operatingUnitGrants = await this.prisma.client.userOperatingUnitScope.findMany({
      where: { userId }
    });
    const customerGrants = await this.prisma.client.userCustomerScope.findMany({ where: { userId } });
    const teamGrants = await this.prisma.client.teamMember.findMany({
      where: { userId, isActive: true }
    });
    const operatingUnits = await this.prisma.client.operatingUnit.findMany({
      where: { id: { in: operatingUnitGrants.map((grant) => grant.operatingUnitId) } }
    });
    const customers = await this.prisma.client.customer.findMany({
      where: { id: { in: customerGrants.map((grant) => grant.customerId) } }
    });
    const teams = await this.prisma.client.team.findMany({
      where: { id: { in: teamGrants.map((grant) => grant.teamId) } }
    });

    const roleCode = `ROLE_${role.code}` as IdentityView["role_code"];
    const canonicalPermissions = permissions.map((permission) => canonicalPermission(permission.code));
    if (!canonicalPermissions.includes("session.read")) canonicalPermissions.push("session.read");
    canonicalPermissions.sort();
    return {
      user_id: user.id,
      identity_code: user.identityCode,
      display_name: user.displayName,
      role_code: roleCode,
      permissions: canonicalPermissions,
      scopes: [
        ...operatingUnits.map((scope) => ({
          scope_type: "OPERATING_UNIT" as const,
          scope_id: scope.id,
          display_name: scope.displayName
        })),
        ...customers.map((scope) => ({
          scope_type: "CUSTOMER" as const,
          scope_id: scope.id,
          display_name: scope.displayName
        })),
        ...teams.map((scope) => ({
          scope_type: "TEAM" as const,
          scope_id: scope.id,
          display_name: scope.displayName
        }))
      ]
    };
  }

  async create(identityCode: string, request: Request): Promise<{
    sessionId: string;
    sessionToken: string;
    csrfToken: string;
    idleExpiresAt: Date;
    expiresAt: Date;
    demoGenerationId: string;
    identity: IdentityView;
  }> {
    const runtime = await this.prisma.client.demoRuntimeControl.findUnique({
      where: { singletonKey: true }
    });
    if (!runtime || runtime.runtimeStatus !== "ACTIVE") {
      throw apiError(request, 503, "DEMO_RESET_IN_PROGRESS", "Demo reset is in progress");
    }
    const user = await this.prisma.client.appUser.findUnique({ where: { identityCode } });
    if (!user?.isActive) {
      throw apiError(request, 404, "DEMO_IDENTITY_NOT_ALLOWED", "Identity is not allowed");
    }

    const now = await this.demoNow();
    const idleMinutes = Number(process.env.SESSION_IDLE_TTL_MINUTES ?? 30);
    const absoluteMinutes = Number(process.env.SESSION_ABSOLUTE_TTL_MINUTES ?? 480);
    const idleExpiresAt = new Date(now.getTime() + idleMinutes * 60_000);
    const expiresAt = new Date(now.getTime() + absoluteMinutes * 60_000);
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();

    await this.prisma.client.$transaction(async (transaction) => {
      await transaction.demoInternalSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: {
          revokedAt: now,
          revocationReasonCode: "REPLACED_BY_NEW_SESSION",
          replacedBySessionId: sessionId,
          version: { increment: 1 }
        }
      });
      await transaction.demoInternalSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          demoGenerationId: runtime.activeGenerationId,
          sessionTokenHash: sha256(sessionToken),
          csrfTokenHash: sha256(csrfToken),
          createdAt: now,
          lastSeenAt: now,
          idleExpiresAt,
          expiresAt,
          createdIpHash: request.ip ? sha256(request.ip) : null
        }
      });
    });

    return {
      sessionId,
      sessionToken,
      csrfToken,
      idleExpiresAt,
      expiresAt,
      demoGenerationId: runtime.activeGenerationId,
      identity: await this.identity(user.id)
    };
  }

  async authenticate(
    request: Request,
    options: { csrf?: boolean; permission?: string; admin?: boolean } = {}
  ): Promise<AuthenticatedSession> {
    const cookieName = process.env.SESSION_COOKIE_NAME ?? "fotc_demo_session";
    const token = (request.cookies as Record<string, string> | undefined)?.[cookieName];
    if (!token) throw apiError(request, 401, "AUTHENTICATION_REQUIRED", "Authentication is required");

    const session = await this.prisma.client.demoInternalSession.findUnique({
      where: { sessionTokenHash: sha256(token) }
    });
    const now = await this.demoNow();
    if (
      !session ||
      session.revokedAt ||
      session.idleExpiresAt <= now ||
      session.expiresAt <= now
    ) {
      throw apiError(request, 401, "SESSION_EXPIRED", "Session is expired");
    }
    if (options.csrf) {
      const csrfToken = request.header("x-csrf-token");
      if (!csrfToken || sha256(csrfToken) !== session.csrfTokenHash) {
        throw apiError(request, 403, "CSRF_VALIDATION_FAILED", "CSRF validation failed");
      }
    }

    const identity = await this.identity(session.userId);
    if (options.permission && !identity.permissions.includes(options.permission)) {
      throw apiError(request, 403, "ACTION_NOT_PERMITTED", "Action is not permitted");
    }
    if (options.admin && identity.role_code !== "ROLE_DEMO_ADMIN") {
      throw apiError(request, 403, "ACTION_NOT_PERMITTED", "Demo Admin role is required");
    }

    await this.prisma.client.demoInternalSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, version: { increment: 1 } }
    });
    return {
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      demoGenerationId: session.demoGenerationId,
      identity
    };
  }

  async revoke(request: Request): Promise<string> {
    const authenticated = await this.authenticate(request, { csrf: true });
    await this.prisma.client.demoInternalSession.update({
      where: { id: authenticated.sessionId },
      data: {
        revokedAt: await this.demoNow(),
        revocationReasonCode: "USER_LOGOUT",
        version: { increment: 1 }
      }
    });
    return authenticated.demoGenerationId;
  }
}
