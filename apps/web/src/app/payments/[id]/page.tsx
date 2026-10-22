import type { Metadata } from 'next';
import { PaymentStatus } from '@/components/payment-status';
import { apiGet } from '@/lib/api';
import { requireUser } from '@/lib/session';
import type { Payment } from '@/lib/types';

export const metadata: Metadata = { title: 'Payment' };

type Props = { params: Promise<{ id: string }> };

// The payment provider sends the customer back here. What the provider puts
// in the URL is ignored: only the API's view of the payment counts.
export default async function PaymentPage({ params }: Props) {
  const { id } = await params;
  await requireUser(`/payments/${id}`);
  const payment = await apiGet<Payment>(`/payments/${id}`);
  return <PaymentStatus initial={payment} />;
}
