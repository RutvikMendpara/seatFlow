import { expect, test } from '@playwright/test';
import { findShow, newEmail, PASSWORD, seatButton } from './helpers';

// Two people looking at the same show in different browsers.
test('a seat taken by someone else disappears from your selection', async ({ browser, request }) => {
  const { showtimeId, seats } = await findShow(request, 2);
  const [wanted, other] = seats;

  const watcherContext = await browser.newContext();
  const watcher = await watcherContext.newPage();
  await watcher.goto(`/showtimes/${showtimeId}`);
  await expect(watcher.getByText('Live')).toBeVisible();
  await seatButton(watcher, wanted!).click();
  await seatButton(watcher, other!).click();

  // Someone else holds one of them.
  const rivalContext = await browser.newContext();
  const rival = await rivalContext.newPage();
  await rival.request.post('/api/auth/register', {
    data: { email: newEmail(), name: 'Rival', password: PASSWORD },
  });
  const hold = await rival.request.post('/api/reservations', {
    data: { showtimeId, seatIds: [wanted!.id] },
  });
  expect(hold.status()).toBe(201);

  // Next.js has its own role="alert" route announcer, so narrow by text.
  await expect(
    watcher.getByRole('alert').filter({ hasText: `${wanted!.label} was just taken. Please pick another seat.` }),
  ).toBeVisible();
  await expect(seatButton(watcher, wanted!)).toHaveAccessibleDescription(/on hold$/);
  await expect(seatButton(watcher, wanted!)).toHaveAttribute('aria-pressed', 'false');
  await expect(seatButton(watcher, other!)).toHaveAttribute('aria-pressed', 'true');

  await rival.request.delete(`/api/reservations/${(await hold.json()).id}`);
  await watcherContext.close();
  await rivalContext.close();
});

test('catches up on changes missed while disconnected', async ({ browser, request }) => {
  const { showtimeId, seats } = await findShow(request, 1);
  const seat = seats[0]!;

  // Proxy the page's WebSocket so the test can drop it and refuse reconnects,
  // like a flaky network. HTTP keeps working.
  const context = await browser.newContext();
  let connected = true;
  const sockets: { close: () => Promise<void> }[] = [];
  await context.routeWebSocket(/\/ws$/, (ws) => {
    if (!connected) {
      void ws.close();
      return;
    }
    ws.connectToServer();
    sockets.push(ws);
  });

  const page = await context.newPage();
  await page.goto(`/showtimes/${showtimeId}`);
  await expect(page.getByText('Live')).toBeVisible();

  connected = false;
  await Promise.all(sockets.map((ws) => ws.close()));
  await expect(page.getByText('Reconnecting…')).toBeVisible();

  // Someone holds the seat while this page can't hear about it.
  const rival = await browser.newContext();
  const rivalPage = await rival.newPage();
  await rivalPage.request.post('/api/auth/register', {
    data: { email: newEmail(), name: 'Rival', password: PASSWORD },
  });
  const hold = await rivalPage.request.post('/api/reservations', {
    data: { showtimeId, seatIds: [seat.id] },
  });
  expect(hold.status()).toBe(201);
  await expect(seatButton(page, seat)).not.toHaveAccessibleDescription(/on hold$/, { timeout: 1_000 });

  // On reconnect the page refetches everything, so the missed hold shows up.
  connected = true;
  await expect(page.getByText('Live')).toBeVisible({ timeout: 20_000 });
  await expect(seatButton(page, seat)).toHaveAccessibleDescription(/on hold$/);

  await rivalPage.request.delete(`/api/reservations/${(await hold.json()).id}`);
  await context.close();
  await rival.close();
});
