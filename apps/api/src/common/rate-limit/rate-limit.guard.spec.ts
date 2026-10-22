import { rateLimitKey } from './rate-limit.guard';

describe('rateLimitKey', () => {
  it('counts signed-in requests per user', () => {
    expect(rateLimitKey({ user: { id: 'u1' }, ip: '10.0.0.1' })).toBe('user:u1');
  });

  it('counts sign-in attempts per account, whatever the IP', () => {
    expect(rateLimitKey({ body: { email: ' Alice@Example.com ' }, ip: '1.1.1.1' })).toBe(
      'email:alice@example.com',
    );
    expect(rateLimitKey({ body: { email: 'alice@example.com' }, ip: '2.2.2.2' })).toBe(
      'email:alice@example.com',
    );
  });

  it('falls back to the IP', () => {
    expect(rateLimitKey({ ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
  });
});
