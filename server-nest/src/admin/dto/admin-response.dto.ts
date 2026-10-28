import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from '../../orders/dto/order-response.dto.js';
import { PartnerResponseDto } from '../../delivery/dto/delivery-response.dto.js';

export class AdminStatsResponseDto {
  @ApiProperty({ example: 120, description: 'Paid or non-card orders only' })
  totalOrders: number;

  @ApiProperty({ example: 48 }) totalUsers: number;
  @ApiProperty({ example: 35 }) totalProducts: number;
  @ApiProperty({ example: 3, description: 'Products whose stock is exactly 0' })
  outOfStock: number;

  @ApiProperty({ example: 6 }) totalPartners: number;

  @ApiProperty({ type: [OrderResponseDto], description: 'The 8 newest orders' })
  recentOrders: OrderResponseDto[];
}

export class PartnerListResponseDto {
  @ApiProperty({ type: [PartnerResponseDto] })
  partners: PartnerResponseDto[];
}

export class PartnerItemResponseDto {
  @ApiProperty({ type: PartnerResponseDto })
  partner: PartnerResponseDto;
}
