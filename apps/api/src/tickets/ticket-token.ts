import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'SF1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mac(ticketId: string, secret: string) {
  return createHmac('sha256', secret).update(`${PREFIX}.${ticketId}`).digest('base64url');
}

// What goes in the QR code. The signature means a gate scanner can reject
// a made-up ticket without looking anything up, and ticket ids can't be guessed
// into valid tickets.
export function signTicket(ticketId: string, secret: string) {
  return `${PREFIX}.${ticketId}.${mac(ticketId, secret)}`;
}

export function verifyTicket(token: string, secret: string): string | null {
  const [prefix, ticketId, signature] = token.split('.');
  if (prefix !== PREFIX || !ticketId || !signature || !UUID.test(ticketId)) return null;

  const expected = Buffer.from(mac(ticketId, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return ticketId;
}
