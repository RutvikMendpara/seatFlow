import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.service';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { LIMITS } from '../common/rate-limit/limits';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@UseGuards(SessionGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  // SessionGuard runs first (class level), so the limit is per user.
  @Post()
  @UseGuards(RateLimitGuard)
  @Throttle(LIMITS.hold)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReservationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && !/^[\w-]{8,100}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be 8-100 letters, digits, - or _');
    }
    return this.reservations.create(user, dto, idempotencyKey);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.findForUser(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  release(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.release(user, id);
  }
}
