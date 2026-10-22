import { certificateLabel, formatShowDate, formatTime, showFormatLabel } from '@/lib/format';
import type { ShowtimeDetail } from '@/lib/types';

export function ShowSummary({ show, seats }: { show: ShowtimeDetail; seats: string[] }) {
  return (
    <div>
      <p className="text-lg font-semibold">{show.movie.title}</p>
      <p className="text-sm text-ink-muted">
        {certificateLabel(show.movie.certificate)} · {show.language} · {showFormatLabel(show.format)}
      </p>
      <p className="mt-3">
        {show.cinema.name}, {show.auditorium}
      </p>
      <p className="text-ink-muted">
        {formatShowDate(show.startsAt)}, {formatTime(show.startsAt)}
      </p>
      <p className="mt-3 font-medium">Seats: {seats.join(', ')}</p>
    </div>
  );
}
