import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export const COORDINATES_MESSAGE =
  'Location coordinates are required. Please allow location access.';
const FIELDS_MESSAGE = 'Please provide all address fields';

export class CreateAddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  label: string;

  @ApiProperty({ example: '12 Tahrir St' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  address: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  city: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  state: string;

  @ApiProperty({ example: '11511' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  zip: string;

  @ApiPropertyOptional({
    example: false,
    description: 'The first address of a user is always the default',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  // @Type converts numeric strings to numbers (the old code used Number(lat))
  @ApiProperty({ example: 30.0444, description: 'Latitude (-90 to 90)' })
  @Type(() => Number)
  @IsLatitude({ message: COORDINATES_MESSAGE })
  lat: number;

  @ApiProperty({ example: 31.2357, description: 'Longitude (-180 to 180)' })
  @Type(() => Number)
  @IsLongitude({ message: COORDINATES_MESSAGE })
  lng: number;
}
