import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { PaymentOutcomesService, type Outcome } from './payment-outcomes.service';
import { verifyWebhookSignature } from './webhook-signature';

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string(),
  data: z.object({
    orderId: z.string().min(1),
    reference: z.string(),
    paymentId: z.string().nullable(),
    amount: z.number().int(),
    currency: z.string(),
    failureReason: z.string().nullable().optional(),
  }),
});

@Controller('payments/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly secret: string;

  constructor(
    private readonly outcomes: PaymentOutcomesService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('PAYMENT_WEBHOOK_SECRET', { infer: true });
  }

  // Any non-2xx makes the provider retry, which is what we want if something
  // fails halfway: the transaction rolls back, including the event record,
  // and the retry starts clean.
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('sim-signature') signature: string | undefined,
  ) {
    if (!req.rawBody || !verifyWebhookSignature(req.rawBody, signature, this.secret)) {
      throw new BadRequestException('Invalid signature');
    }

    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestException('Unexpected webhook payload');
    const event = parsed.data;

    const result = await this.outcomes.run(async (tx): Promise<Outcome | 'duplicate' | 'ignored'> => {
      const inserted = await tx.$executeRaw`
        INSERT INTO payment_events (id, provider_event_id, type, payload)
        VALUES (uuidv7(), ${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)
        ON CONFLICT (provider_event_id) DO NOTHING
      `;
      if (inserted === 0) return 'duplicate';

      const { orderId, reference, paymentId, amount, currency, failureReason } = event.data;
      switch (event.type) {
        case 'payment.succeeded':
          if (!paymentId) throw new BadRequestException('Succeeded payment without a payment id');
          return this.outcomes.succeeded(tx, {
            orderId,
            reference,
            paymentId,
            amountPaise: amount,
            currency,
          });
        case 'payment.failed':
          return this.outcomes.failed(tx, { orderId, reference, reason: failureReason ?? null });
        default:
          return 'ignored';
      }
    });

    this.logger.log(`Webhook ${event.id} ${event.type}: ${result}`);
    return { received: true, result };
  }
}

