import { describe, expect, it } from 'vitest';
import { buildLines, mergeSeats, neighbour, type SeatStates } from './seat-map';
import type { Seat } from './types';

const seat = (row: string, number: number, gridRow: number, gridColumn: number): Seat => ({
  id: `${row}${number}`,
  label: `${row}${number}`,
  row,
  number,
  category: gridRow >= 2 ? 'PREMIUM' : 'CLASSIC',
  gridRow,
  gridColumn,
});

// A1 A2 _ A3     (gridRow 0)
// B1 B2 _ B3     (gridRow 1)
// (gap row 2)
// C1 C2          (gridRow 3, premium, shifted right by one)
const seats = [
  seat('A', 1, 0, 0), seat('A', 2, 0, 1), seat('A', 3, 0, 3),
  seat('B', 1, 1, 0), seat('B', 2, 1, 1), seat('B', 3, 1, 3),
  seat('C', 1, 3, 1), seat('C', 2, 3, 2),
];
const byId = (id: string) => seats.find((s) => s.id === id)!;

describe('buildLines', () => {
  it('draws rows from the back, with headers and gaps', () => {
    const lines = buildLines({ rows: 4, columns: 4, seats });
    expect(lines.map((l) => (l.kind === 'row' ? l.label : l.kind === 'header' ? l.category : 'gap'))).toEqual([
      'PREMIUM', 'C', 'gap', 'CLASSIC', 'B', 'A',
    ]);
  });
});

describe('neighbour', () => {
  it('moves along a row across an aisle', () => {
    expect(neighbour(seats, byId('A2'), 'right')?.id).toBe('A3');
    expect(neighbour(seats, byId('A1'), 'left')).toBeUndefined();
    expect(neighbour(seats, byId('B2'), 'end')?.id).toBe('B3');
  });

  it('moves between rows to the closest column, skipping gap rows', () => {
    expect(neighbour(seats, byId('A1'), 'up')?.id).toBe('B1');
    expect(neighbour(seats, byId('B3'), 'up')?.id).toBe('C2');
    expect(neighbour(seats, byId('C1'), 'down')?.id).toBe('B2');
    expect(neighbour(seats, byId('A2'), 'down')).toBeUndefined();
  });
});

describe('mergeSeats', () => {
  const current: SeatStates = new Map([['A1', { id: 'A1', status: 'HELD', version: 3 }]]);

  it('ignores updates older than what it has', () => {
    const merged = mergeSeats(current, [{ id: 'A1', status: 'AVAILABLE', version: 2 }], 'update');
    expect(merged.get('A1')?.status).toBe('HELD');
  });

  it('applies newer updates', () => {
    const merged = mergeSeats(current, [{ id: 'A1', status: 'SOLD', version: 4 }], 'update');
    expect(merged.get('A1')?.status).toBe('SOLD');
  });

  it('lets a snapshot win a tie, for holds that expired without a write', () => {
    const merged = mergeSeats(current, [{ id: 'A1', status: 'AVAILABLE', version: 3 }], 'snapshot');
    expect(merged.get('A1')?.status).toBe('AVAILABLE');
    const update = mergeSeats(current, [{ id: 'A1', status: 'AVAILABLE', version: 3 }], 'update');
    expect(update.get('A1')?.status).toBe('HELD');
  });
});
