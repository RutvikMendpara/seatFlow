import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

// Background jobs run in their own process so they can be scaled and
// restarted separately from the API.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}
void bootstrap();
