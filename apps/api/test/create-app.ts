import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PAYMENT_GATEWAY } from '../src/payments/gateway/payment-gateway';
import { FakeGateway } from './fake-gateway';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(new FakeGateway())
    .compile();

  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}

export function fakeGateway(app: INestApplication) {
  return app.get<FakeGateway>(PAYMENT_GATEWAY);
}
