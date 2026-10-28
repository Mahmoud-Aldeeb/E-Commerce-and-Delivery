import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryPartnerDto {
  @ApiPropertyOptional({ example: 'Omar Hassan' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '01012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'car' })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'false deactivates the partner: they are blocked immediately',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
