import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Controller('cities')
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.city.findMany({
      select: { slug: true, name: true, state: true },
      orderBy: { name: 'asc' },
    });
  }
}
