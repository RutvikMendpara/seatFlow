# Frontend

The web app is Next.js 16 (App Router) with React 19 and Tailwind CSS 4.
Pages render on the server. Client components are used where the page has
to react to the user or to live data: the seat map, checkout timer and
payment status.

## Talking to the API

- The browser calls `/api/*` on the web app, and `next.config.ts` rewrites
  that to the API. The session cookie is first-party and there's no CORS.
- Server components call the API directly (`src/lib/api.ts`) and forward
  the user's session cookie.
- The WebSocket goes straight to the API at `/ws`, since Next.js rewrites
  don't proxy WebSockets. Set `NEXT_PUBLIC_WS_URL` in production; locally it
  defaults to port 4000 on the same host.

## Booking flow

| Page | What happens |
|---|---|
| `/showtimes/[id]` | Seat map with live availability. Continue holds the seats (with an idempotency key) and goes to checkout. Signed-out users sign in and come back with their seats still picked (`?seats=`). |
| `/checkout/[id]` | Summary, price breakdown and hold countdown. Pay starts the payment and redirects to the provider. Change seats releases the hold. |
| `/payments/[id]` | Where the provider sends the customer back. Polls the API until the payment settles. The provider's redirect itself is never trusted. |
| `/bookings`, `/bookings/[ref]` | Booking history and the ticket with its QR code. |

Pay and Change seats are forms backed by server actions, not click
handlers. Under load, tests clicked those buttons before the page hydrated
and the clicks were lost. A form works as soon as the HTML is there.

The countdown corrects for the device's clock using `serverTime` from the
API, so a phone with the wrong time still shows the right number.

## Live seats

See [ADR 6](adr/0006-live-seats-websocket-notify.md) for the server side.
In the browser (`src/hooks/use-seat-updates.ts`, `src/lib/seat-map.ts`):

- Updates are merged per seat by `version`. An update applies only if it's
  newer than what the page has. A full snapshot also wins a tie, since it
  reflects holds that expired without a write.
- The page refetches the snapshot after subscribing (to cover the gap since
  the server render), after reconnecting, on `resync`, and when the tab
  becomes visible again.
- While the socket is down it shows "Reconnecting…" and polls every 15
  seconds.
- If a seat you picked gets taken, it's removed from your selection with a
  visible notice that is also announced to screen readers.

## Accessibility

Target is WCAG 2.2 AA. Playwright runs axe on the main pages
(`e2e/accessibility.spec.ts`).

Seat map:

- Every seat is a `<button>` with `aria-pressed`. Its name is built from
  the content ("Row H, seat 5"), so the visible number is part of it. That
  matters for voice control (WCAG 2.5.3). Category, price and status come
  from one of a few shared `aria-describedby` elements.
- The map is one tab stop. The arrow keys move between seats, including
  across aisles and gap rows, and Home/End go to the ends of a row.
- Taken seats use a striped pattern, sold seats an ×, and selected seats a
  ✓, so the states don't depend on colour.
- Seats are 24×24 px, the WCAG 2.2 minimum target size.
- Changes ("A5 selected", "A5 was just taken") go to a polite live region.

Elsewhere: a skip link, visible focus rings, form errors linked with
`aria-describedby`, `role="timer"` for the countdown (announced at 2
minutes and 30 seconds rather than every second), and `prefers-reduced-motion`
turning off transitions and the spinner.

Things axe caught that are now fixed: grey text and the green status colour
were under 4.5:1, and several controls had `aria-label`s that didn't
contain their visible text.

## Responsive layout

The seat map scrolls sideways inside its own box on small screens, and the
summary bar sticks to the bottom. The page itself must never scroll
sideways. The journey test checks this on a Pixel 7, after it caught the
seat map's screen-reader-only labels escaping the scroll box and widening
the page.

## Tests

```bash
cd apps/web
pnpm test         # Vitest: seat map helpers, price formatting
pnpm test:e2e     # Playwright against the running Docker stack
```

Playwright needs the stack up and seeded (`docker compose up`, then
`docker compose exec api pnpm db:seed`) and Chromium installed
(`pnpm exec playwright install chromium`). Set `E2E_BASE_URL` to run against
another environment.
