import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelDeliveryDto {
  @ApiPropertyOptional({ example: 'Customer is not answering the phone' })
  @IsOptional()
  @IsString()
  reason?: string;
}
