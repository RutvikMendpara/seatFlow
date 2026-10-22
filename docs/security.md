# Security

What SeatFlow protects against, how, and which test checks it. This is a
portfolio project, so it covers the basics properly rather than everything.

| Risk | Mitigation | Checked by |
|---|---|---|
| Changing the price from the browser | Prices come only from `showtime_prices`. Unknown body fields are rejected (`forbidNonWhitelisted`). | `security` › extra fields are rejected, `checkout` › priced on the server |
| Touching someone else's reservation, payment or booking | Every query filters by the session's user. Other users' records return `404`, so ids aren't confirmed to exist. | `reservations` › hides other users' reservations, `checkout`, `tickets` |
| Staff-only actions | Ticket check-in requires the `ADMIN` role (`RolesGuard`). | `tickets` › only lets staff check tickets in |
| Forged payment webhooks | HMAC-SHA256 over the raw body with a 5-minute timestamp window, compared in constant time. | `payment-webhooks` › rejects bad signatures, `webhook-signature.spec` |
| Replayed webhooks | Timestamp window, plus provider event ids stored with a unique index. | `payment-webhooks` › same event delivered many times |
| Forged tickets | The QR code carries the ticket id plus an HMAC. Unsigned or altered tokens are rejected before any lookup. | `tickets` › turns away forged tickets, `ticket-token.spec` |
| Password guessing | scrypt hashes. Sign-in is limited to 10 attempts per account per 15 minutes, whatever IP they come from. Unknown emails take as long as wrong passwords. | `security` › slows down password guessing, `password.spec` |
| One user hogging the booking system | Holds (30/min) and checkouts (20/min) are limited per user, so others aren't affected. | `security` › limits hold requests per user |
| Stolen database contents | Only SHA-256 hashes of session tokens are stored, and passwords are scrypt hashes. | `auth.service.ts` |
| Session theft through scripts | The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. | `auth` › registers, reads the session |
| CSRF | `SameSite=Lax` keeps the cookie off cross-site POSTs, the API only accepts JSON bodies, and Next.js server actions check the origin. | |
| SQL injection | Prisma parameters everywhere, including raw SQL (tagged templates). | `security` › treats SQL in search as plain text |
| WebSocket abuse | Connections from other origins are refused, there are at most 4 subscriptions per socket, and dead sockets are dropped. Only public availability is sent. | `live-seats` › refuses connections from other sites |
| Clickjacking, MIME sniffing | `helmet` on the API. `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` on the web app. | `security` › sends security headers |
| Secrets in code | Secrets come from the environment and are validated at startup. Only test values are in `.env.example`. | `config/env.ts` |
| Personal data in logs | Confirmation emails are logged with the address masked. Tokens and passwords are never logged. | |

## Client IPs and proxies

Browsers reach the API through the web app's `/api` rewrite, and Next.js
passes `X-Forwarded-For` through as the client sent it. So the API only
trusts that header from the proxies named in `TRUST_PROXY` (default:
loopback only). Behind a real reverse proxy that sets the header itself,
set `TRUST_PROXY` to that proxy's address.

Because of this, nothing important is rate limited by IP alone. Sign-in is
limited per account and booking actions per user. Registration is per IP,
which without a trusted proxy means one shared limit for everyone.

## Known gaps

- Rate limit counters are in memory, so each API instance counts on its own.
  Shared limits would need Redis.
- No Content-Security-Policy on the web app yet. Next.js needs nonces for its
  inline scripts.
- No account lockout notifications, email verification or 2FA.
- No audit log table. Payment provider events are kept in `payment_events`,
  but there's no record of staff actions yet.
