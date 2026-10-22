import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

export const PASSWORD = 'e2e-test-password';

type Seat = { id: string; label: string; row: string; number: number; gridRow: number; gridColumn: number };

// A random run of `count` adjacent free seats in one row, from a few random
// shows. Random so tests running in parallel (and earlier runs)
// rarely go for the same seats.
export async function findShow(request: APIRequestContext, count = 2) {
  // Every day on the schedule, not just the first, so there's plenty to pick from.
  const first = await (await request.get('/api/movies/orbit-nine/showtimes?city=mumbai')).json();
  const days = await Promise.all(
    (first.dates as string[]).map(async (date) =>
      (await request.get(`/api/movies/orbit-nine/showtimes?city=mumbai&date=${date}`)).json(),
    ),
  );
  const showIds: string[] = days.flatMap((day) =>
    day.cinemas.flatMap((c: { showtimes: { id: string }[] }) => c.showtimes.map((s) => s.id)),
  );

  const runs: { showtimeId: string; seats: Seat[] }[] = [];
  for (const showtimeId of showIds.sort(() => Math.random() - 0.5).slice(0, 8)) {
    const [detail, availability] = await Promise.all([
      (await request.get(`/api/showtimes/${showtimeId}`)).json(),
      (await request.get(`/api/showtimes/${showtimeId}/seats`)).json(),
    ]);
    const free = new Set(
      availability.seats.filter((s: { status: string }) => s.status === 'AVAILABLE').map((s: { id: string }) => s.id),
    );
    const seats = (detail.layout.seats as Seat[])
      .filter((s) => free.has(s.id))
      .sort((a, b) => b.gridRow - a.gridRow || a.gridColumn - b.gridColumn);

    for (let i = 0; i + count <= seats.length; i++) {
      const run = seats.slice(i, i + count);
      if (run.every((s, j) => s.gridRow === run[0]!.gridRow && s.gridColumn === run[0]!.gridColumn + j)) {
        runs.push({ showtimeId, seats: run });
      }
    }
  }
  if (runs.length > 0) return runs[Math.floor(Math.random() * runs.length)]!;
  throw new Error('No show with enough free seats. Re-seed the database.');
}

export function newEmail() {
  return `e2e-${randomBytes(5).toString('hex')}@example.com`;
}

// Signs up through the API. The session cookie lands in the page's context.
export async function signUp(page: Page) {
  const res = await page.request.post('/api/auth/register', {
    data: { email: newEmail(), name: 'E2E Tester', password: PASSWORD },
  });
  expect(res.status()).toBe(201);
}

export function seatButton(page: Page, seat: Pick<Seat, 'row' | 'number'>) {
  return page.getByRole('button', { name: `Row ${seat.row}, seat ${seat.number}`, exact: true });
}

export async function payOnSimulator(
  page: Page,
  outcome: 'pay' | 'decline' | 'cancel',
  delivery: 'normal' | 'late' | 'duplicate' | 'drop' = 'normal',
) {
  await expect(page).toHaveURL(/\/checkout\/order_/);
  const radio = {
    normal: 'Send right away',
    late: 'Send late',
    duplicate: 'Send three times',
    drop: "Don't send",
  }[delivery];
  await page.getByLabel(radio).check();
  const button = { pay: /^Pay ₹/, decline: 'Decline the payment', cancel: 'Cancel and go back' }[outcome];
  await page.getByRole('button', { name: button }).click();
}
