import { Test, type TestingModule } from '@nestjs/testing';
import type { Email, Mailer } from '../src/notifications/mailer';
import { MAILER } from '../src/notifications/mailer';
import { PAYMENT_GATEWAY } from '../src/payments/gateway/payment-gateway';
import { WorkerModule } from '../src/worker/worker.module';
import { FakeGateway } from './fake-gateway';

export class FakeMailer implements Mailer {
  readonly sent: Email[] = [];
  async send(email: Email) {
    this.sent.push(email);
  }
}

// The worker's services without starting its timers. Tests call the jobs directly.
export async function createTestWorker(gateway = new FakeGateway()) {
  const mailer = new FakeMailer();
  const moduleRef: TestingModule = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(gateway)
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  return { moduleRef, gateway, mailer };
}
