import { Injectable } from "@nestjs/common";
import type { Request } from "express";

import { apiError } from "./api-error";

@Injectable()
export class DemoModeService {
  assertEnabled(request: Request): void {
    if (process.env.DEMO_MODE !== "true") {
      throw apiError(request, 403, "DEMO_FEATURE_DISABLED", "Demo features are disabled");
    }
  }
}
