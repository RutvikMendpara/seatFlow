import type { Movie } from '@/lib/types';

// Seed data has no artwork, so posters are drawn from the title.
const palettes = [
  ['#1e3a8a', '#7c3aed'],
  ['#7f1d1d', '#ea580c'],
  ['#064e3b', '#0d9488'],
  ['#312e81', '#db2777'],
  ['#1f2937', '#64748b'],
  ['#713f12', '#ca8a04'],
  ['#4c1d95', '#2563eb'],
  ['#831843', '#f43f5e'],
];

function hash(value: string) {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

type Props = {
  movie: Pick<Movie, 'slug' | 'title' | 'genres' | 'posterUrl'>;
  className?: string;
};

export function Poster({ movie, className = '' }: Props) {
  if (movie.posterUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={movie.posterUrl}
        alt=""
        className={`aspect-[2/3] w-full rounded-xl object-cover ${className}`}
      />
    );
  }

  const [from, to] = palettes[hash(movie.slug) % palettes.length]!;
  return (
    <div
      aria-hidden
      className={`relative flex aspect-[2/3] w-full flex-col justify-end overflow-hidden rounded-xl p-4 text-white ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
    >
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
      <div className="absolute top-16 -left-8 size-24 rounded-full bg-white/5" />
      <p className="text-[11px] font-medium tracking-widest uppercase opacity-80">
        {movie.genres.slice(0, 2).join(' · ')}
      </p>
      <p className="mt-1 text-xl leading-tight font-bold text-balance">
        {movie.title}
      </p>
    </div>
  );
}
