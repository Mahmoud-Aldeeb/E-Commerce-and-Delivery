import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'Ordered by mistake' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'The reason must be 200 characters or fewer' })
  reason?: string;
}
