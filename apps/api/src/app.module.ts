import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { CorrelationMiddleware } from "./common/correlation.middleware";
import { DemoModeService } from "./common/demo-mode.service";
import { PrismaService } from "./database/prisma.service";
import { DemoController } from "./demo/demo.controller";
import { DemoService } from "./demo/demo.service";
import { HealthController } from "./health/health.controller";
import { SessionController } from "./session/session.controller";
import { SessionService } from "./session/session.service";

@Module({
  controllers: [HealthController, SessionController, DemoController],
  providers: [DemoModeService, PrismaService, SessionService, DemoService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
