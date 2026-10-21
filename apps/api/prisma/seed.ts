import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Certificate,
  PrismaClient,
  SeatCategory,
  ShowFormat,
} from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Fixed seed so the generated schedule is the same on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(42);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]!;

const IST_OFFSET_MS = 330 * 60 * 1000;

function istToday() {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  return { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() };
}

function istDateTime(dayOffset: number, time: string) {
  const { y, m, d } = istToday();
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m, d + dayOffset, hh, mm) - IST_OFFSET_MS);
}

function istDate(dayOffset: number) {
  const { y, m, d } = istToday();
  return new Date(Date.UTC(y, m, d + dayOffset));
}

const movies = [
  {
    slug: 'the-monsoon-line',
    title: 'The Monsoon Line',
    synopsis:
      'A railway signalman in the Western Ghats uncovers a smuggling route running through his sleepy station during the worst monsoon in decades.',
    runtimeMinutes: 142,
    languages: ['Hindi'],
    genres: ['Drama', 'Thriller'],
    certificate: Certificate.UA13,
    releaseInDays: -12,
    rating: 8.1,
  },
  {
    slug: 'kaveri-nights',
    title: 'Kaveri Nights',
    synopsis:
      'Two strangers keep missing each other at the same riverside café in Srirangapatna, until a power cut changes everything.',
    runtimeMinutes: 151,
    languages: ['Tamil', 'Telugu'],
    genres: ['Romance', 'Drama'],
    certificate: Certificate.UA7,
    releaseInDays: -20,
    rating: 7.6,
  },
  {
    slug: 'orbit-nine',
    title: 'Orbit Nine',
    synopsis:
      'The crew of an ageing orbital station has 40 hours to bring it down safely after a debris strike cuts them off from ground control.',
    runtimeMinutes: 128,
    languages: ['English', 'Hindi'],
    genres: ['Sci-Fi', 'Action'],
    certificate: Certificate.UA13,
    releaseInDays: -5,
    rating: 8.4,
  },
  {
    slug: 'chalk-and-chai',
    title: 'Chalk & Chai',
    synopsis:
      'A burnt-out maths teacher in Indore is talked into coaching the school\'s hopeless quiz team for the state finals.',
    runtimeMinutes: 118,
    languages: ['Hindi'],
    genres: ['Comedy', 'Family'],
    certificate: Certificate.U,
    releaseInDays: -26,
    rating: 7.9,
  },
  {
    slug: 'ironwood',
    title: 'Ironwood',
    synopsis:
      'A retired forest ranger is pulled back into the jungle when a logging convoy goes missing near the border.',
    runtimeMinutes: 136,
    languages: ['English', 'Hindi', 'Tamil'],
    genres: ['Action', 'Adventure'],
    certificate: Certificate.UA16,
    releaseInDays: -9,
    rating: 7.2,
  },
  {
    slug: 'ghost-harbour',
    title: 'Ghost Harbour',
    synopsis:
      'A dock inspector working the night shift starts finding cargo manifests for ships that sank fifty years ago.',
    runtimeMinutes: 104,
    languages: ['English'],
    genres: ['Horror', 'Mystery'],
    certificate: Certificate.A,
    releaseInDays: -15,
    rating: 6.8,
  },
  {
    slug: 'pinnacle',
    title: 'Pinnacle',
    synopsis:
      'A mountaineering guide in Munnar has one night to work out which of her clients sabotaged the rope line.',
    runtimeMinutes: 133,
    languages: ['Malayalam'],
    genres: ['Thriller'],
    certificate: Certificate.UA13,
    releaseInDays: -7,
    rating: 8.3,
  },
  {
    slug: 'little-comet',
    title: 'Little Comet',
    synopsis:
      'A small comet that refuses to burn out sets off on a trip across the solar system to find where it belongs.',
    runtimeMinutes: 96,
    languages: ['English', 'Hindi'],
    genres: ['Animation', 'Family'],
    certificate: Certificate.U,
    releaseInDays: -3,
    rating: 7.7,
  },
  {
    slug: 'paper-kites',
    title: 'Paper Kites',
    synopsis:
      'Three generations of a family in old Ahmedabad spend one last Uttarayan together before the house is sold.',
    runtimeMinutes: 124,
    languages: ['Hindi', 'Gujarati'],
    genres: ['Drama', 'Family'],
    certificate: Certificate.U,
    releaseInDays: -31,
    rating: 8.0,
  },
  {
    slug: 'sea-of-lanterns',
    title: 'Sea of Lanterns',
    synopsis:
      'A fisherman\'s daughter follows a trail of floating lanterns to an island that only appears once a year.',
    runtimeMinutes: 158,
    languages: ['Kannada', 'Telugu'],
    genres: ['Fantasy', 'Adventure'],
    certificate: Certificate.UA7,
    releaseInDays: 2,
    rating: null,
  },
  {
    slug: 'mohalla-cricket-club',
    title: 'Mohalla Cricket Club',
    synopsis:
      'A gully cricket team from Lucknow gets an unlikely shot at a city tournament after their rivals are disqualified.',
    runtimeMinutes: 127,
    languages: ['Hindi'],
    genres: ['Comedy', 'Sports'],
    certificate: Certificate.U,
    releaseInDays: 5,
    rating: null,
  },
  {
    slug: 'the-last-signal',
    title: 'The Last Signal',
    synopsis:
      'A radio astronomer in Ooty picks up a repeating signal that seems to be counting down.',
    runtimeMinutes: 131,
    languages: ['English'],
    genres: ['Sci-Fi', 'Thriller'],
    certificate: Certificate.UA13,
    releaseInDays: 16,
    rating: null,
  },
  {
    slug: 'nightshift-at-kolar',
    title: 'Nightshift at Kolar',
    synopsis:
      'An old mining town, a missing payroll and a night watchman who knows more than he says.',
    runtimeMinutes: 141,
    languages: ['Kannada'],
    genres: ['Crime', 'Thriller'],
    certificate: Certificate.UA16,
    releaseInDays: 24,
    rating: null,
  },
] as const;

type RowSpec = {
  label: string;
  seats: number;
  category: SeatCategory;
  aislesAfter: number[];
  gapBefore?: boolean;
};

type Layout = RowSpec[];

const { CLASSIC, PREMIUM, RECLINER } = SeatCategory;

function rows(
  labels: string,
  seats: number,
  category: SeatCategory,
  aislesAfter: number[],
): RowSpec[] {
  return [...labels].map((label) => ({ label, seats, category, aislesAfter }));
}

// Row labels skip I and O, like most Indian cinemas.
const layouts: Record<string, Layout> = {
  standard: [
    ...rows('ABCDEFGH', 14, CLASSIC, [3, 11]),
    ...rows('JKL', 14, PREMIUM, [3, 11]).map((r, i) => ({
      ...r,
      gapBefore: i === 0,
    })),
  ],
  compact: [
    ...rows('ABCDEF', 10, CLASSIC, [5]),
    ...rows('GH', 10, PREMIUM, [5]),
    { label: 'J', seats: 6, category: RECLINER, aislesAfter: [3], gapBefore: true },
  ],
  large: [
    ...rows('ABCDEFGHJK', 20, CLASSIC, [4, 16]),
    ...rows('LMN', 20, PREMIUM, [4, 16]).map((r, i) => ({
      ...r,
      gapBefore: i === 0,
    })),
    { label: 'P', seats: 10, category: RECLINER, aislesAfter: [5], gapBefore: true },
  ],
};

function buildSeats(layout: Layout) {
  const width = (r: RowSpec) => r.seats + r.aislesAfter.length;
  const maxWidth = Math.max(...layout.map(width));
  const seats: {
    rowLabel: string;
    number: number;
    category: SeatCategory;
    gridRow: number;
    gridColumn: number;
  }[] = [];

  let gridRow = 0;
  for (const row of layout) {
    if (row.gapBefore) gridRow++;
    let gridColumn = Math.floor((maxWidth - width(row)) / 2);
    for (let n = 1; n <= row.seats; n++) {
      seats.push({
        rowLabel: row.label,
        number: n,
        category: row.category,
        gridRow,
        gridColumn,
      });
      gridColumn += row.aislesAfter.includes(n) ? 2 : 1;
    }
    gridRow++;
  }
  return seats;
}

type CinemaSeed = {
  slug: string;
  name: string;
  address: string;
  // Multiplier on base ticket prices.
  tier: number;
  screens: { name: string; layout: keyof typeof layouts; imax?: boolean }[];
};

const cities: {
  slug: string;
  name: string;
  state: string;
  cinemas: CinemaSeed[];
}[] = [
  {
    slug: 'mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    cinemas: [
      {
        slug: 'starlight-andheri',
        name: 'Starlight Cinemas: Andheri West',
        address: 'Link Road, Andheri West, Mumbai 400053',
        tier: 1.1,
        screens: [
          { name: 'Screen 1', layout: 'large', imax: true },
          { name: 'Screen 2', layout: 'standard' },
          { name: 'Screen 3', layout: 'compact' },
        ],
      },
      {
        slug: 'reel-palace-lower-parel',
        name: 'Reel Palace: Lower Parel',
        address: 'Senapati Bapat Marg, Lower Parel, Mumbai 400013',
        tier: 1.25,
        screens: [
          { name: 'Audi 1', layout: 'standard' },
          { name: 'Audi 2', layout: 'compact' },
        ],
      },
      {
        slug: 'lumiere-thane',
        name: 'Lumière: Thane',
        address: 'Ghodbunder Road, Thane West 400607',
        tier: 0.9,
        screens: [
          { name: 'Screen 1', layout: 'standard' },
          { name: 'Screen 2', layout: 'standard' },
        ],
      },
    ],
  },
  {
    slug: 'bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    cinemas: [
      {
        slug: 'starlight-koramangala',
        name: 'Starlight Cinemas: Koramangala',
        address: '80 Feet Road, Koramangala, Bengaluru 560034',
        tier: 1.1,
        screens: [
          { name: 'Screen 1', layout: 'large', imax: true },
          { name: 'Screen 2', layout: 'compact' },
        ],
      },
      {
        slug: 'cine-square-whitefield',
        name: 'Cine Square: Whitefield',
        address: 'ITPL Main Road, Whitefield, Bengaluru 560066',
        tier: 1,
        screens: [
          { name: 'Audi 1', layout: 'standard' },
          { name: 'Audi 2', layout: 'standard' },
          { name: 'Audi 3', layout: 'compact' },
        ],
      },
    ],
  },
  {
    slug: 'delhi-ncr',
    name: 'Delhi NCR',
    state: 'Delhi',
    cinemas: [
      {
        slug: 'reel-palace-saket',
        name: 'Reel Palace: Saket',
        address: 'Press Enclave Marg, Saket, New Delhi 110017',
        tier: 1.2,
        screens: [
          { name: 'Audi 1', layout: 'large' },
          { name: 'Audi 2', layout: 'compact' },
        ],
      },
      {
        slug: 'lumiere-gurugram',
        name: 'Lumière: Cyber Hub',
        address: 'DLF Cyber City, Gurugram 122002',
        tier: 1.05,
        screens: [
          { name: 'Screen 1', layout: 'standard' },
          { name: 'Screen 2', layout: 'standard' },
        ],
      },
    ],
  },
  {
    slug: 'pune',
    name: 'Pune',
    state: 'Maharashtra',
    cinemas: [
      {
        slug: 'cine-square-kothrud',
        name: 'Cine Square: Kothrud',
        address: 'Karve Road, Kothrud, Pune 411038',
        tier: 0.85,
        screens: [
          { name: 'Audi 1', layout: 'standard' },
          { name: 'Audi 2', layout: 'compact' },
        ],
      },
    ],
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    cinemas: [
      {
        slug: 'starlight-hitech-city',
        name: 'Starlight Cinemas: HITEC City',
        address: 'Madhapur Road, HITEC City, Hyderabad 500081',
        tier: 1,
        screens: [
          { name: 'Screen 1', layout: 'large', imax: true },
          { name: 'Screen 2', layout: 'standard' },
        ],
      },
    ],
  },
];

const SHOW_SLOTS = ['09:45', '13:15', '16:45', '20:15'];
const SCHEDULE_DAYS = 7;
const BASE_PRICE_RUPEES: Record<SeatCategory, number> = {
  CLASSIC: 190,
  PREMIUM: 290,
  RECLINER: 550,
};

function ticketPricePaise(
  category: SeatCategory,
  tier: number,
  slot: string,
  startsAt: Date,
  imax: boolean,
) {
  let rupees = BASE_PRICE_RUPEES[category] * tier;
  if (slot >= '16:45') rupees += 40;
  const istDay = new Date(startsAt.getTime() + IST_OFFSET_MS).getUTCDay();
  if (istDay === 0 || istDay === 6) rupees += 30;
  if (imax) rupees += 150;
  return Math.round(rupees / 10) * 10 * 100;
}

async function main() {
  await prisma.showtimePrice.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.auditorium.deleteMany();
  await prisma.cinema.deleteMany();
  await prisma.city.deleteMany();
  await prisma.movie.deleteMany();

  const createdMovies = [];
  for (const { releaseInDays, ...movie } of movies) {
    createdMovies.push(
      await prisma.movie.create({
        data: {
          ...movie,
          languages: [...movie.languages],
          genres: [...movie.genres],
          releaseDate: istDate(releaseInDays),
        },
      }),
    );
  }

  let auditoriumCount = 0;
  let showtimeCount = 0;

  for (const { cinemas, ...city } of cities) {
    const { id: cityId } = await prisma.city.create({ data: city });

    for (const { screens, tier, ...cinema } of cinemas) {
      const { id: cinemaId } = await prisma.cinema.create({
        data: { ...cinema, cityId },
      });

      for (const [screenIndex, screen] of screens.entries()) {
        const auditorium = await prisma.auditorium.create({
          data: { cinemaId, name: screen.name },
        });
        auditoriumCount++;

        const seats = buildSeats(layouts[screen.layout]!);
        await prisma.seat.createMany({
          data: seats.map((s) => ({ ...s, auditoriumId: auditorium.id })),
        });
        const categories = [...new Set(seats.map((s) => s.category))];

        const shows = [];
        for (let day = 0; day < SCHEDULE_DAYS; day++) {
          const released = createdMovies.filter(
            (m) => m.releaseDate <= istDate(day),
          );
          for (const slot of SHOW_SLOTS) {
            // Leave the odd slot empty so schedules don't look generated.
            if (random() < 0.08) continue;

            // Stagger screens so the same cinema doesn't start everything at once.
            const startsAt = new Date(
              istDateTime(day, slot).getTime() + screenIndex * 15 * 60 * 1000,
            );
            if (startsAt.getTime() < Date.now()) continue;

            const movie = pick(released);
            shows.push({
              slot,
              movie,
              startsAt,
              endsAt: new Date(
                startsAt.getTime() + movie.runtimeMinutes * 60 * 1000,
              ),
              language: pick(movie.languages),
            });
          }
        }

        const created = await prisma.showtime.createManyAndReturn({
          data: shows.map((s) => ({
            movieId: s.movie.id,
            auditoriumId: auditorium.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            language: s.language,
            format: screen.imax
              ? ShowFormat.IMAX
              : s.movie.genres.includes('Animation')
                ? ShowFormat.THREE_D
                : ShowFormat.STANDARD,
          })),
          select: { id: true, startsAt: true },
        });
        showtimeCount += created.length;

        const slotByStart = new Map(
          shows.map((s) => [s.startsAt.getTime(), s.slot]),
        );
        await prisma.showtimePrice.createMany({
          data: created.flatMap((show) =>
            categories.map((category) => ({
              showtimeId: show.id,
              category,
              pricePaise: ticketPricePaise(
                category,
                tier,
                slotByStart.get(show.startsAt.getTime())!,
                show.startsAt,
                screen.imax ?? false,
              ),
            })),
          ),
        });
      }
    }
  }

  console.log(
    `Seeded ${createdMovies.length} movies, ${cities.length} cities, ` +
      `${auditoriumCount} auditoriums and ${showtimeCount} showtimes.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
