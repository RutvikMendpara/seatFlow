import { formatPrice, seatCategoryLabel } from '@/lib/format';
import type { Price, Seat, SeatCategory, ShowtimeDetail } from '@/lib/types';

type Line =
  | { kind: 'header'; category: SeatCategory }
  | { kind: 'row'; label: string; seats: Seat[] }
  | { kind: 'gap'; key: number };

// Row A is nearest the screen, so rows are drawn bottom-up with the screen last.
function buildLines(layout: ShowtimeDetail['layout']): Line[] {
  const byRow = new Map<number, Seat[]>();
  for (const seat of layout.seats) {
    byRow.set(seat.gridRow, [...(byRow.get(seat.gridRow) ?? []), seat]);
  }

  const lines: Line[] = [];
  let lastCategory: SeatCategory | undefined;
  for (let r = layout.rows - 1; r >= 0; r--) {
    const seats = byRow.get(r);
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

type Props = { layout: ShowtimeDetail['layout']; prices: Price[] };

export function SeatLayout({ layout, prices }: Props) {
  const priceOf = new Map(prices.map((p) => [p.category, p.pricePaise]));
  const columns = `2rem repeat(${layout.columns}, 1.75rem)`;
  const categories = [...new Set(layout.seats.map((s) => s.category))];
  const summary = categories
    .map((c) => `${seatCategoryLabel(c)} ${formatPrice(priceOf.get(c) ?? 0)}`)
    .join(', ');

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div
        role="img"
        aria-label={`Seat layout with ${layout.seats.length} seats. ${summary}.`}
        className="mx-auto w-max"
      >
        {buildLines(layout).map((line) => {
          if (line.kind === 'gap') return <div key={`gap-${line.key}`} className="h-4" />;
          if (line.kind === 'header') {
            return (
              <p
                key={`h-${line.category}`}
                className="mt-4 mb-2 border-b border-line pb-1 text-xs font-medium tracking-wide text-ink-muted uppercase first:mt-0"
              >
                {seatCategoryLabel(line.category)} · {formatPrice(priceOf.get(line.category) ?? 0)}
              </p>
            );
          }
          return (
            <div
              key={line.label}
              className="mb-1.5 grid items-center gap-x-0"
              style={{ gridTemplateColumns: columns }}
            >
              <span className="text-xs font-medium text-ink-subtle">{line.label}</span>
              {line.seats.map((seat) => (
                <span
                  key={seat.id}
                  style={{ gridColumnStart: seat.gridColumn + 2 }}
                  className={`mx-auto grid size-6 place-items-center rounded-t-md rounded-b-sm border text-[10px] text-ink-muted ${
                    seat.category === 'RECLINER'
                      ? 'border-ink-subtle'
                      : 'border-line-strong'
                  }`}
                >
                  {seat.number}
                </span>
              ))}
            </div>
          );
        })}

        <div className="mt-8">
          <div className="mx-auto h-3 w-4/5 rounded-[50%] border-t-4 border-line-strong" />
          <p className="text-center text-[11px] tracking-widest text-ink-subtle uppercase">
            Screen this way
          </p>
        </div>
      </div>
    </div>
  );
}
