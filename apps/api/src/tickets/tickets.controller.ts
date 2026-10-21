import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { UserRole } from '../generated/prisma/client';
import { CheckInDto } from './dto/check-in.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
@UseGuards(SessionGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // Always 200: the scanner shows whatever the result is.
  @Post('check-in')
  @HttpCode(200)
  checkIn(@Body() dto: CheckInDto) {
    return this.tickets.checkIn(dto);
  }
}
