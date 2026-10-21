import type { PaymentAttempt } from '../generated/prisma/client';

export function toPaymentResponse(
  payment: PaymentAttempt,
  bookingReference: string | null = null,
) {
  return {
    id: payment.id,
    reservationId: payment.reservationId,
    status: payment.status,
    subtotalPaise: payment.subtotalPaise,
    feePaise: payment.feePaise,
    taxPaise: payment.taxPaise,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    checkoutUrl: payment.status === 'PENDING' ? payment.checkoutUrl : null,
    failureReason: payment.failureReason,
    bookingReference,
  };
}
