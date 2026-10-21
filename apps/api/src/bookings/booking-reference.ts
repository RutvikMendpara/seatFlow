import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L, so it can be read out over the phone at the box office.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newBookingReference() {
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `SF-${code}`;
}
