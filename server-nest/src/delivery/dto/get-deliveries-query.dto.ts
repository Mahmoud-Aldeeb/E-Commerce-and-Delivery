import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class GetDeliveriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'completed',
    description:
      '"active" (Assigned, Packed, Out for Delivery), "completed" (Delivered, Cancelled), or omit for all',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
