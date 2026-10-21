import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaymentStatus } from '../../generated/prisma/client';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../payments/gateway/payment-gateway';
import type { OutboxHandler } from '../outbox.processor';

type Payload = { paymentAttemptId: string; amountPaise: number };

@Injectable()
export class RefundRequestedHandler implements OutboxHandler {
  private readonly logger = new Logger(RefundRequestedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async handle(payload: unknown) {
    const { paymentAttemptId, amountPaise } = payload as Payload;
    const payment = await this.prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: paymentAttemptId },
    });
    if (payment.status !== PaymentStatus.REFUND_PENDING) return;
    if (!payment.providerPaymentId) {
      throw new Error(`Payment ${payment.id} has no provider payment id to refund`);
    }

    // Keyed on our payment id, so a repeat of this event can't refund twice.
    const refund = await this.gateway.refund(
      payment.providerPaymentId,
      amountPaise,
      `refund-${payment.id}`,
    );
    await this.prisma.paymentAttempt.updateMany({
      where: { id: payment.id, status: PaymentStatus.REFUND_PENDING },
      data: { status: PaymentStatus.REFUNDED, refundId: refund.id },
    });
    this.logger.log(`Refunded payment ${payment.id} (${refund.id})`);
  }
}
