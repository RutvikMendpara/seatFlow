import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp(app: INestApplication) {
  // Which proxies may tell us the client's IP through X-Forwarded-For. Only
  // set this to a proxy that overwrites that header itself (nginx, a load
  // balancer). The Next.js rewrite passes on whatever the client sent, so
  // trusting it would let anyone pick their own IP.
  (app as NestExpressApplication).set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
}
