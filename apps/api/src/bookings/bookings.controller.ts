import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { BookingsService } from './bookings.service';

@Controller('bookings')
@UseGuards(SessionGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.bookings.listForUser(user);
  }

  @Get(':reference')
  findOne(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.bookings.findForUser(user, reference);
  }

  @Get(':reference/ticket.svg')
  @Header('content-type', 'image/svg+xml')
  @Header('cache-control', 'private, no-store')
  qr(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.bookings.ticketQrSvg(user, reference);
  }
}
