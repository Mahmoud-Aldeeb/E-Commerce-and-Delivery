import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
} from 'class-validator';
import { COORDINATES_MESSAGE } from './create-address.dto.js';

// Written out in full (instead of PartialType) because lat/lng stay required on update
export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Work' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: '5 Nile Corniche' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Giza' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Giza' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '12611' })
  @IsOptional()
  @IsString()
  zip?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ example: 30.0444, description: 'Latitude (-90 to 90)' })
  @Type(() => Number)
  @IsLatitude({ message: COORDINATES_MESSAGE })
  lat: number;

  @ApiProperty({ example: 31.2357, description: 'Longitude (-180 to 180)' })
  @Type(() => Number)
  @IsLongitude({ message: COORDINATES_MESSAGE })
  lng: number;
}
