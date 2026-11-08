import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { RETURN_TABS, type ReturnTab } from '../return-tabs.js';

export class GetAdminReturnsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RETURN_TABS,
    description: 'Which returns to list',
  })
  @IsOptional()
  @IsIn(RETURN_TABS, { message: 'Unknown tab' })
  tab?: ReturnTab;

  @ApiPropertyOptional({
    description:
      'A part of the return number, the order number, or the name or email of the customer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
