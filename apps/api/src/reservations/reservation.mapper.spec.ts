import { effectiveStatus } from './reservation.mapper';

describe('effectiveStatus', () => {
  const now = new Date('2026-10-22T10:00:00Z');

  it('treats a hold past its expiry as expired', () => {
    expect(effectiveStatus('HELD', new Date('2026-10-22T09:59:59Z'), now)).toBe('EXPIRED');
    expect(effectiveStatus('HELD', now, now)).toBe('EXPIRED');
  });

  it('keeps a live hold as held', () => {
    expect(effectiveStatus('HELD', new Date('2026-10-22T10:00:01Z'), now)).toBe('HELD');
  });

  it('leaves other statuses alone', () => {
    const past = new Date('2026-10-22T09:00:00Z');
    expect(effectiveStatus('CANCELLED', past, now)).toBe('CANCELLED');
    expect(effectiveStatus('CONFIRMED', past, now)).toBe('CONFIRMED');
  });
});
