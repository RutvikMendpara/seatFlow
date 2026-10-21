import { priceBooking } from './pricing';

describe('priceBooking', () => {
  it('adds a per-seat fee and GST on the fee', () => {
    expect(priceBooking([20000, 25000])).toEqual({
      subtotalPaise: 45000,
      feePaise: 6000,
      taxPaise: 1080,
      amountPaise: 52080,
    });
  });

  it('charges the fee per seat', () => {
    expect(priceBooking([10000])).toMatchObject({ feePaise: 3000, taxPaise: 540 });
    expect(priceBooking([10000, 10000, 10000])).toMatchObject({ feePaise: 9000, taxPaise: 1620 });
  });

  it('always adds up', () => {
    const p = priceBooking([19000, 29000, 55000]);
    expect(p.amountPaise).toBe(p.subtotalPaise + p.feePaise + p.taxPaise);
  });
});
