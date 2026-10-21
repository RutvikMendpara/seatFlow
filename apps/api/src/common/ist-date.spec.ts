import {
  istDayRange,
  istToday,
  isValidDateString,
  toIstDateString,
} from './ist-date';

describe('ist-date', () => {
  it('rolls over to the next day at 18:30 UTC', () => {
    expect(toIstDateString(new Date('2026-10-21T18:29:59Z'))).toBe('2026-10-21');
    expect(toIstDateString(new Date('2026-10-21T18:30:00Z'))).toBe('2026-10-22');
  });

  it('uses the IST date for today', () => {
    expect(istToday(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });

  it('builds a day range in IST', () => {
    const { start, end } = istDayRange('2026-10-22');
    expect(start.toISOString()).toBe('2026-10-21T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-22T18:30:00.000Z');
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidDateString('2026-10-22')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('22-10-2026')).toBe(false);
    expect(isValidDateString('2026-1-5')).toBe(false);
  });
});
