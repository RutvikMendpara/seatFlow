export const CONVENIENCE_FEE_PER_SEAT_PAISE = 3000;
// GST applies to the convenience fee. Ticket prices already include tax.
export const GST_PERCENT_ON_FEE = 18;

export type PriceBreakdown = {
  subtotalPaise: number;
  feePaise: number;
  taxPaise: number;
  amountPaise: number;
};

export function priceBooking(seatPricesPaise: number[]): PriceBreakdown {
  const subtotalPaise = seatPricesPaise.reduce((sum, p) => sum + p, 0);
  const feePaise = CONVENIENCE_FEE_PER_SEAT_PAISE * seatPricesPaise.length;
  const taxPaise = Math.round((feePaise * GST_PERCENT_ON_FEE) / 100);
  return {
    subtotalPaise,
    feePaise,
    taxPaise,
    amountPaise: subtotalPaise + feePaise + taxPaise,
  };
}
