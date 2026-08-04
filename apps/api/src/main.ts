import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3001",
      credentials: true,
      exposedHeaders: ["X-CSRF-Token", "X-Demo-Generation-ID", "ETag"]
    }
  });
  app.use(cookieParser());
  await app.listen(Number(process.env.API_PORT ?? 3000), "0.0.0.0");
}

void bootstrap();
