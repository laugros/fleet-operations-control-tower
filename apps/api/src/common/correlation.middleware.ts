import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { correlationId } from "./api-error";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const resolvedCorrelationId = correlationId(request);
    request.headers["x-correlation-id"] = resolvedCorrelationId;
    response.setHeader("X-Correlation-ID", resolvedCorrelationId);
    next();
  }
}
