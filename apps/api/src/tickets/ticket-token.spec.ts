import { signTicket, verifyTicket } from './ticket-token';

const secret = 'test-ticket-secret-that-is-long-enough';
const ticketId = '01999999-aaaa-7bbb-8ccc-dddddddddddd';

describe('ticket tokens', () => {
  it('round-trips a ticket id', () => {
    expect(verifyTicket(signTicket(ticketId, secret), secret)).toBe(ticketId);
  });

  it('rejects a token signed with another secret', () => {
    expect(verifyTicket(signTicket(ticketId, 'some-other-secret-value-here'), secret)).toBeNull();
  });

  it('rejects a token with the ticket id swapped', () => {
    const [prefix, , signature] = signTicket(ticketId, secret).split('.');
    const forged = `${prefix}.01999999-aaaa-7bbb-8ccc-eeeeeeeeeeee.${signature}`;
    expect(verifyTicket(forged, secret)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyTicket('', secret)).toBeNull();
    expect(verifyTicket('SF1.not-a-uuid.abc', secret)).toBeNull();
    expect(verifyTicket(`SF2.${ticketId}.abc`, secret)).toBeNull();
  });
});
