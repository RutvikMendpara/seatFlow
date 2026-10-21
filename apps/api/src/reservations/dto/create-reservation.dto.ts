import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export const MAX_SEATS_PER_BOOKING = 10;

export class CreateReservationDto {
  @IsUUID()
  showtimeId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SEATS_PER_BOOKING)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  seatIds: string[];
}
