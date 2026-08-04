import { HttpException } from "@nestjs/common";
import type { Request } from "express";
import { randomUUID } from "node:crypto";

export function correlationId(request: Request): string {
  const candidate = request.header("x-correlation-id");
  return candidate && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : randomUUID();
}

export function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  details: Array<{ field: string | null; reason: string }> = []
): HttpException {
  return new HttpException(
    {
      error: {
        code,
        message,
        details,
        correlation_id: correlationId(request)
      }
    },
    status
  );
}
