import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckInDto {
  @IsString()
  @MaxLength(200)
  token: string;

  // The cinema doing the scan. Tickets for other cinemas are turned away.
  @IsOptional()
  @IsString()
  cinema?: string;
}
