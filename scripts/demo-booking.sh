#!/usr/bin/env bash
# Books two seats end to end against the running Docker stack:
# sign up, hold seats, check out, pay on the simulator, wait for the
# webhook to confirm, fetch the ticket, and check it in at the gate.
#
#   ./scripts/demo-booking.sh [normal|late|duplicate|drop]
#
# The argument picks how the simulator delivers the webhook. With "drop"
# nothing is sent, and the booking only goes through once the worker's
# reconciliation job asks the provider (after the payment deadline), so
# that one takes a while unless PAYMENT_WINDOW_SECONDS is lowered.
set -euo pipefail

DELIVERY="${1:-normal}"
API="${API_URL:-http://localhost:4000/api}"
PAYMENTS="${PAYMENTS_URL:-http://localhost:4100}"
PAYMENT_KEY="${PAYMENT_API_KEY:-sk_test_seatflow}"
JAR="$(mktemp)"
ADMIN_JAR="$(mktemp)"
trap 'rm -f "$JAR" "$ADMIN_JAR"' EXIT

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
post() { curl -sf -b "$JAR" -c "$JAR" -H 'content-type: application/json' "$@"; }

echo "1. Sign up"
EMAIL="demo-$(date +%s)@example.com"
post -d "{\"email\":\"$EMAIL\",\"name\":\"Demo\",\"password\":\"demo-password-1\"}" "$API/auth/register" >/dev/null
echo "   $EMAIL"

echo "2. Pick a show and two free seats"
SHOW=$(curl -sf "$API/movies/orbit-nine/showtimes?city=mumbai" | json 'd["cinemas"][0]["showtimes"][0]["id"]')
SEATS=$(curl -sf "$API/showtimes/$SHOW/seats" | json 'json.dumps([s["id"] for s in d["seats"] if s["status"]=="AVAILABLE"][:2])')

echo "3. Hold them"
RES=$(post -H "Idempotency-Key: demo-$(date +%s%N)" -d "{\"showtimeId\":\"$SHOW\",\"seatIds\":$SEATS}" "$API/reservations")
RES_ID=$(echo "$RES" | json 'd["id"]')
echo "   $(echo "$RES" | json '", ".join(s["label"] for s in d["seats"]) + " held until " + d["expiresAt"]')"

echo "4. Check out"
PAY=$(post -X POST "$API/reservations/$RES_ID/checkout")
PAY_ID=$(echo "$PAY" | json 'd["id"]')
ORDER=$(echo "$PAY" | json 'd["checkoutUrl"].rsplit("/",1)[1]')
echo "   total ₹$(echo "$PAY" | json 'd["amountPaise"]/100') -> $(echo "$PAY" | json 'd["checkoutUrl"]')"

echo "5. Pay on the simulator (webhook: $DELIVERY)"
curl -sf -H "Authorization: Bearer $PAYMENT_KEY" -H 'content-type: application/json' \
  -d "{\"outcome\":\"pay\",\"delivery\":\"$DELIVERY\"}" "$PAYMENTS/v1/test/orders/$ORDER/complete" >/dev/null

echo "6. Wait for the booking to be confirmed"
for _ in $(seq 1 120); do
  STATUS=$(curl -sf -b "$JAR" "$API/payments/$PAY_ID" | json 'd["status"]')
  [ "$STATUS" != "PENDING" ] && break
  sleep 1
done
REF=$(curl -sf -b "$JAR" "$API/payments/$PAY_ID" | json 'd["bookingReference"] or ""')
echo "   payment $STATUS, booking ${REF:-none}"
[ -n "$REF" ] || exit 1

echo "7. Fetch the ticket"
TOKEN=$(curl -sf -b "$JAR" "$API/bookings/$REF" | json 'd["ticket"]["token"]')
curl -sf -b "$JAR" "$API/bookings/$REF/ticket.svg" -o /dev/null && echo "   QR code ok"

echo "8. Check in at the gate"
if [ -n "${SEED_ADMIN_EMAIL:-}" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  curl -sf -c "$ADMIN_JAR" -H 'content-type: application/json' \
    -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}" "$API/auth/login" >/dev/null
  for i in 1 2; do
    curl -sf -b "$ADMIN_JAR" -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" \
      "$API/tickets/check-in" | json '"   scan '"$i"': " + d["result"]'
  done
else
  echo "   skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, e.g. source .env)"
fi
