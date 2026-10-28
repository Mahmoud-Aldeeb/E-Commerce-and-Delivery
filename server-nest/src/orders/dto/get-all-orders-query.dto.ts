import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ADMIN_ORDER_TABS, type AdminOrderTab } from '../admin-order-tabs.js';

export class GetAllOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_ORDER_TABS, example: 'needs-courier' })
  @IsOptional()
  @IsIn([...ADMIN_ORDER_TABS], { message: 'Invalid tab' })
  tab?: AdminOrderTab;

  @ApiPropertyOptional({
    example: 'A1B2C3D4',
    description:
      'Searches the order number, the customer name and the customer email',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: 'The search text must be 100 characters or fewer',
  })
  search?: string;
}
