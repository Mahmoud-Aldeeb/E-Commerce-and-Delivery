import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

const MESSAGE = 'Valid coordinates are required';

export class UpdateLocationDto {
  @ApiProperty({ example: 30.0444, description: 'Latitude (-90 to 90)' })
  @Type(() => Number)
  @IsLatitude({ message: MESSAGE })
  lat: number;

  @ApiProperty({ example: 31.2357, description: 'Longitude (-180 to 180)' })
  @Type(() => Number)
  @IsLongitude({ message: MESSAGE })
  lng: number;
}
