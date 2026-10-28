import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { OrderResponseDto } from '../../orders/dto/order-response.dto.js';

export class PartnerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Omar Hassan' }) name: string;
  @ApiProperty({ example: 'omar@example.com' }) email: string;
  @ApiProperty({ example: '01012345678' }) phone: string;
  @ApiPropertyOptional({ nullable: true }) avatar: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'bike' }) vehicleType:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: true }) isActive:
    boolean | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PartnerLoginResponseDto {
  @ApiProperty({ type: PartnerResponseDto }) partner: PartnerResponseDto;
  @ApiProperty({ description: 'JWT with role "delivery", valid for 30 days' })
  token: string;
}

export class DeliveryOrderUserDto {
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
}

// Same as an order, but WITHOUT deliveryOtp (the partner must never see it)
export class DeliveryOrderResponseDto extends OmitType(OrderResponseDto, [
  'deliveryOtp',
  'user',
  'deliveryPartner',
] as const) {
  @ApiPropertyOptional({ type: DeliveryOrderUserDto })
  user?: DeliveryOrderUserDto;
}

export class DeliveryListResponseDto {
  @ApiProperty({ type: [DeliveryOrderResponseDto] })
  orders: DeliveryOrderResponseDto[];

  @ApiProperty({
    example: 25,
    description: 'Orders matching the filter, across all pages',
  })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({
    example: 3,
    description: 'Number of pages (1 when limit is not used)',
  })
  pages: number;
}
export class DeliveryItemResponseDto {
  @ApiProperty({ type: DeliveryOrderResponseDto })
  order: DeliveryOrderResponseDto;
}

export class DeliveryActionResponseDto {
  @ApiProperty({ type: DeliveryOrderResponseDto })
  order: DeliveryOrderResponseDto;

  @ApiProperty({ example: 'Delivery completed successfully' })
  message: string;
}

export class LocationUpdateResponseDto {
  @ApiProperty({ example: true }) success: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      lat: 30.0444,
      lng: 31.2357,
      updatedAt: '2026-10-08T12:00:00.000Z',
    },
  })
  liveLocation: object;
}
