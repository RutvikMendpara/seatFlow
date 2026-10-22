import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { LIMITS } from '../common/rate-limit/limits';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { CheckoutService } from './checkout.service';

@Controller()
@UseGuards(SessionGuard)
export class PaymentsController {
  constructor(private readonly checkout: CheckoutService) {}

  // Safe to call repeatedly: while a payment is in flight, this returns it
  // instead of starting another.
  @Post('reservations/:id/checkout')
  @UseGuards(RateLimitGuard)
  @Throttle(LIMITS.checkout)
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.startCheckout(user, id);
  }

  @Get('payments/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.findForUser(user, id);
  }
}
