import { formatPrice, seatCategoryLabel } from '@/lib/format';
import type { PriceBreakdown, Reservation } from '@/lib/types';

type Props = { seats: Reservation['seats']; price: PriceBreakdown; totalLabel?: string };

export function PriceSummary({ seats, price, totalLabel = 'Total' }: Props) {
  const byCategory = new Map<string, { count: number; paise: number }>();
  for (const seat of seats) {
    const entry = byCategory.get(seat.category) ?? { count: 0, paise: 0 };
    byCategory.set(seat.category, { count: entry.count + 1, paise: entry.paise + seat.pricePaise });
  }

  return (
    <dl className="space-y-2 text-sm">
      {[...byCategory].map(([category, { count, paise }]) => (
        <div key={category} className="flex justify-between">
          <dt className="text-ink-muted">
            {seatCategoryLabel(category as Reservation['seats'][number]['category'])} × {count}
          </dt>
          <dd>{formatPrice(paise)}</dd>
        </div>
      ))}
      <div className="flex justify-between">
        <dt className="text-ink-muted">Convenience fee</dt>
        <dd>{formatPrice(price.feePaise)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-muted">GST on fee (18%)</dt>
        <dd>{formatPrice(price.taxPaise)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
        <dt>{totalLabel}</dt>
        <dd>{formatPrice(price.amountPaise)}</dd>
      </div>
    </dl>
  );
}
