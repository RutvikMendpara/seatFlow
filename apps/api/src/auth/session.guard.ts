import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthUser } from './auth.service';

export const SESSION_COOKIE = 'sf_session';

export type AuthedRequest = Request & { user?: AuthUser };

// Browsers send the cookie. Scripts and load tests can use a bearer token instead.
export function sessionToken(req: Request): string | undefined {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = sessionToken(req);
    const user = token ? await this.auth.userForToken(token) : null;
    if (!user) throw new UnauthorizedException('Sign in to continue');
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new Error('CurrentUser used without SessionGuard');
    return user;
  },
);
