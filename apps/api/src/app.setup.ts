import { INestApplication, ValidationPipe } from '@nestjs/common';

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
