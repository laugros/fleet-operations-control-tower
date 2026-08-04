import { Body, Controller, Delete, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { apiError, correlationId } from "../common/api-error";
import { DemoModeService } from "../common/demo-mode.service";
import { SessionService } from "./session.service";

const createSessionSchema = z
  .object({
    identity_code: z.enum([
      "demo.attendant",
      "demo.operations",
      "demo.supervisor",
      "demo.manager",
      "demo.admin"
    ])
  })
  .strict();

@Controller()
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly demoMode: DemoModeService
  ) {}

  @Post("api/v1/demo/sessions")
  async create(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    this.demoMode.assertEnabled(request);
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw apiError(request, 400, "INVALID_REQUEST", "Request body is invalid");
    }
    const session = await this.sessions.create(parsed.data.identity_code, request);
    const cookieName = process.env.SESSION_COOKIE_NAME ?? "fotc_demo_session";
    const configuredAbsoluteTtlMinutes = Number(
      process.env.SESSION_ABSOLUTE_TTL_MINUTES ?? 480
    );
    const cookieMaxAge =
      (Number.isFinite(configuredAbsoluteTtlMinutes) && configuredAbsoluteTtlMinutes > 0
        ? configuredAbsoluteTtlMinutes
        : 480) * 60_000;
    response.status(201);
    response.cookie(cookieName, session.sessionToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: cookieMaxAge
    });
    response.setHeader("X-CSRF-Token", session.csrfToken);
    response.setHeader("X-Demo-Generation-ID", session.demoGenerationId);
    return {
      data: {
        session_id: session.sessionId,
        identity: session.identity,
        idle_expires_at: session.idleExpiresAt.toISOString(),
        expires_at: session.expiresAt.toISOString()
      },
      meta: {
        correlation_id: correlationId(request),
        occurred_at: new Date().toISOString(),
        demo_generation_id: session.demoGenerationId
      }
    };
  }

  @Delete("api/v1/demo/sessions/current")
  async remove(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const generationId = await this.sessions.revoke(request);
    response.status(204);
    response.setHeader("X-Demo-Generation-ID", generationId);
    response.clearCookie(process.env.SESSION_COOKIE_NAME ?? "fotc_demo_session", { path: "/" });
  }

  @Get("api/v1/session")
  async current(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    const session = await this.sessions.authenticate(request, { permission: "session.read" });
    response.setHeader("X-Demo-Generation-ID", session.demoGenerationId);
    return {
      data: session.identity,
      meta: {
        correlation_id: correlationId(request),
        occurred_at: new Date().toISOString(),
        demo_generation_id: session.demoGenerationId
      }
    };
  }
}
