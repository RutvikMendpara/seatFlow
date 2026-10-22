import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// What a request is counted against:
// - a signed-in user, so people on the same network don't share a limit
// - the email being signed in to, so guessing one account's password is
//   slow no matter how many IPs it comes from
// - otherwise the client IP (see TRUST_PROXY for when that's reliable)
export function rateLimitKey(req: { user?: { id?: unknown }; body?: { email?: unknown }; ip?: string }) {
  if (typeof req.user?.id === 'string') return `user:${req.user.id}`;
  if (typeof req.body?.email === 'string') return `email:${req.body.email.trim().toLowerCase()}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

// Applied per route with @UseGuards. Routes without it aren't limited.
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return rateLimitKey(req);
  }
}
