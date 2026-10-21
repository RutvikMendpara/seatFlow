import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type User } from '../generated/prisma/client';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import { hashPassword, verifyPassword } from './password';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthUser = Pick<User, 'id' | 'email' | 'name' | 'role'>;

const authUserSelect = { id: true, email: true, name: true, role: true } as const;

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  // Compared against when the email doesn't exist, so the response time
  // doesn't reveal which emails are registered.
  private readonly dummyHash = hashPassword('not-a-real-password');

  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name.trim(),
          passwordHash: await hashPassword(dto.password),
        },
        select: authUserSelect,
      });
      return { user, token: await this.createSession(user.id) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(dto.password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    const { id, email, name, role } = user;
    return { user: { id, email, name, role }, token: await this.createSession(id) };
  }

  async logout(token: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async userForToken(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { expiresAt: true, user: { select: authUserSelect } },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    return session.user;
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return token;
  }
}
