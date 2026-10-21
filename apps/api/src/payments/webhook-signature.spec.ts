import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature';

const secret = 'whsec_test_secret_value';
const body = Buffer.from('{"id":"evt_1"}');
const now = 1_800_000_000_000;

function sign(timestamp: number, payload = body, key = secret) {
  const hex = createHmac('sha256', key).update(`${timestamp}.${payload.toString()}`).digest('hex');
  return `t=${timestamp},v1=${hex}`;
}

describe('verifyWebhookSignature', () => {
  const t = now / 1000;

  it('accepts a valid signature', () => {
    expect(verifyWebhookSignature(body, sign(t), secret, now)).toBe(true);
  });

  it('rejects a changed body or the wrong secret', () => {
    expect(verifyWebhookSignature(Buffer.from('{"id":"evt_2"}'), sign(t), secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, sign(t, body, 'another_secret_value'), secret, now)).toBe(false);
  });

  it('rejects old and future timestamps', () => {
    expect(verifyWebhookSignature(body, sign(t - 301), secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, sign(t + 301), secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, sign(t - 299), secret, now)).toBe(true);
  });

  it('accepts any matching v1 during secret rotation', () => {
    const header = `${sign(t, body, 'old_secret_value_xx')},v1=${sign(t).split('v1=')[1]}`;
    expect(verifyWebhookSignature(body, header, secret, now)).toBe(true);
  });

  it('rejects missing or malformed headers', () => {
    expect(verifyWebhookSignature(body, undefined, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, 'garbage', secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},v1=zz`, secret, now)).toBe(false);
  });
});
