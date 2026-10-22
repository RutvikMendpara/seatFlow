import type { Seat, SeatCategory, SeatState, ShowtimeDetail } from './types';

export type Line =
  | { kind: 'header'; category: SeatCategory }
  | { kind: 'row'; label: string; seats: Seat[] }
  | { kind: 'gap'; key: number };

// Row A is nearest the screen, so rows are drawn bottom-up with the screen last.
export function buildLines(layout: ShowtimeDetail['layout']): Line[] {
  const byRow = new Map<number, Seat[]>();
  for (const seat of layout.seats) {
    byRow.set(seat.gridRow, [...(byRow.get(seat.gridRow) ?? []), seat]);
  }

  const lines: Line[] = [];
  let lastCategory: SeatCategory | undefined;
  for (let r = layout.rows - 1; r >= 0; r--) {
    const seats = byRow.get(r)?.sort((a, b) => a.gridColumn - b.gridColumn);
    if (!seats) {
      lines.push({ kind: 'gap', key: r });
      continue;
    }
    const category = seats[0]!.category;
    if (category !== lastCategory) {
      lines.push({ kind: 'header', category });
      lastCategory = category;
    }
    lines.push({ kind: 'row', label: seats[0]!.row, seats });
  }
  return lines;
}

export type SeatStates = Map<string, SeatState>;

// Live updates and full snapshots can arrive in any order. Each seat's
// version only goes up, so keep whichever is newer. A snapshot wins a tie
// because it also reflects holds that expired without a write.
export function mergeSeats(
  current: SeatStates,
  incoming: SeatState[],
  source: 'update' | 'snapshot',
): SeatStates {
  const next = new Map(current);
  for (const seat of incoming) {
    const known = next.get(seat.id);
    const newer = !known || (source === 'snapshot' ? seat.version >= known.version : seat.version > known.version);
    if (newer) next.set(seat.id, seat);
  }
  return next;
}

export type Direction = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

// Finds the seat to move focus to with the arrow keys. Up and down go to the
// seat in the next drawn row whose column is closest, skipping gaps.
export function neighbour(seats: Seat[], from: Seat, direction: Direction): Seat | undefined {
  const sameRow = seats
    .filter((s) => s.gridRow === from.gridRow)
    .sort((a, b) => a.gridColumn - b.gridColumn);
  const index = sameRow.findIndex((s) => s.id === from.id);

  switch (direction) {
    case 'left':
      return sameRow[index - 1];
    case 'right':
      return sameRow[index + 1];
    case 'home':
      return sameRow[0];
    case 'end':
      return sameRow.at(-1);
  }

  // Rows are drawn bottom-up, so "up" on screen means a higher gridRow.
  const rows = [...new Set(seats.map((s) => s.gridRow))].sort((a, b) => a - b);
  const rowIndex = rows.indexOf(from.gridRow);
  const target = rows[direction === 'up' ? rowIndex + 1 : rowIndex - 1];
  if (target === undefined) return undefined;

  return seats
    .filter((s) => s.gridRow === target)
    .sort(
      (a, b) =>
        Math.abs(a.gridColumn - from.gridColumn) - Math.abs(b.gridColumn - from.gridColumn) ||
        a.gridColumn - b.gridColumn,
    )[0];
}
