import { createHmac, timingSafeEqual } from 'node:crypto';

// Rejects webhooks older than this, so a captured request can't be replayed later.
export const SIGNATURE_TOLERANCE_SECONDS = 300;

// Header format: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">
export function verifyWebhookSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!header) return false;

  const parts = new Map<string, string[]>();
  for (const item of header.split(',')) {
    const [key, value] = item.split('=', 2);
    if (key && value) parts.set(key.trim(), [...(parts.get(key.trim()) ?? []), value.trim()]);
  }

  const timestamp = Number(parts.get('t')?.[0]);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();

  // More than one v1 is allowed so the provider can rotate secrets.
  return (parts.get('v1') ?? []).some((candidate) => {
    const given = Buffer.from(candidate, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
