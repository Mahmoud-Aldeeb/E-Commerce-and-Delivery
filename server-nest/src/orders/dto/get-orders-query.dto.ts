import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class GetOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'active',
    description:
      '"all" (or omit), "active" (not finished), "delivered", "cancelled", or an exact status name',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
