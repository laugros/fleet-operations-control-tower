import { Body, Controller, Get, Headers, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { apiError, correlationId } from "../common/api-error";
import { DemoModeService } from "../common/demo-mode.service";
import { SessionService } from "../session/session.service";
import { DemoService } from "./demo.service";

const resetSchema = z
  .object({ seed_version: z.string().min(1), confirmation: z.literal("RESET_DEMO") })
  .strict();

@Controller("api/v1/demo")
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly sessions: SessionService,
    private readonly demoMode: DemoModeService
  ) {}

  @Get("status")
  async status(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    await this.sessions.authenticate(request, { permission: "demo.read_status", admin: true });
    const result = await this.demo.status();
    response.setHeader("ETag", `"${result.version}"`);
    response.setHeader("X-Demo-Generation-ID", result.generationId);
    return {
      data: result.data,
      meta: {
        correlation_id: correlationId(request),
        occurred_at: new Date().toISOString(),
        demo_generation_id: result.generationId
      }
    };
  }

  @Post("reset")
  async reset(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    this.demoMode.assertEnabled(request);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      const code =
        typeof body === "object" && body !== null && "confirmation" in body
          ? "DEMO_RESET_CONFIRMATION_INVALID"
          : "INVALID_REQUEST";
      throw apiError(request, 400, code, "Reset request is invalid");
    }
    if (!idempotencyKey) {
      throw apiError(request, 400, "INVALID_REQUEST", "Idempotency-Key is required");
    }
    const session = await this.sessions.authenticate(request, {
      csrf: true,
      permission: "demo.reset",
      admin: true
    });
    const result = await this.demo.requestReset(
      parsed.data.seed_version,
      idempotencyKey,
      session,
      request
    );
    response.status(202);
    response.setHeader("X-Demo-Generation-ID", result.view.target_generation_id);
    if (result.replay) response.setHeader("Idempotency-Replayed", "true");
    return {
      data: result.view,
      meta: {
        correlation_id: correlationId(request),
        occurred_at: new Date().toISOString(),
        demo_generation_id: result.view.target_generation_id
      }
    };
  }

  @Get("resets/:resetId")
  async getReset(
    @Param("resetId") resetId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<unknown> {
    const parsedId = z.string().uuid().safeParse(resetId);
    if (!parsedId.success) throw apiError(request, 400, "INVALID_REQUEST", "resetId is invalid");
    const session = await this.sessions.authenticate(request, {
      permission: "demo.read_status",
      admin: true
    });
    const reset = await this.demo.getReset(parsedId.data, request);
    response.setHeader("X-Demo-Generation-ID", session.demoGenerationId);
    return {
      data: reset,
      meta: {
        correlation_id: correlationId(request),
        occurred_at: new Date().toISOString(),
        demo_generation_id: session.demoGenerationId
      }
    };
  }
}
