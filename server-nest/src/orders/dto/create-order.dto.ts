import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Min,
  ValidateNested,
  IsLatitude,
  IsLongitude,
} from 'class-validator';

const ADDRESS_MESSAGE = 'Shipping address is incomplete';

export class ShippingAddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString({ message: ADDRESS_MESSAGE })
  @IsNotEmpty({ message: ADDRESS_MESSAGE })
  label: string;

  @ApiProperty({ example: '12 Tahrir St' })
  @IsString({ message: ADDRESS_MESSAGE })
  @IsNotEmpty({ message: ADDRESS_MESSAGE })
  address: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString({ message: ADDRESS_MESSAGE })
  @IsNotEmpty({ message: ADDRESS_MESSAGE })
  city: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString({ message: ADDRESS_MESSAGE })
  @IsNotEmpty({ message: ADDRESS_MESSAGE })
  state: string;

  @ApiProperty({ example: '11511' })
  @IsString({ message: ADDRESS_MESSAGE })
  @IsNotEmpty({ message: ADDRESS_MESSAGE })
  zip: string;

  @ApiProperty({ example: 30.0444 })
  @Type(() => Number)
  @IsLatitude({ message: ADDRESS_MESSAGE })
  lat: number;

  @ApiProperty({ example: 31.2357 })
  @Type(() => Number)
  @IsLongitude({ message: ADDRESS_MESSAGE })
  lng: number;
}

export class OrderItemDto {
  @ApiProperty({
    description: 'Product id',
    example: '3f2a9c1e-0b7d-4d6e-9a41-5c8e2b7f1a10',
  })
  @IsString({ message: 'Invalid order item' })
  @IsNotEmpty({ message: 'Invalid order item' })
  product: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray({ message: 'No order items' })
  @ArrayNotEmpty({ message: 'No order items' })
  // Validate every element, and turn plain objects into OrderItemDto instances
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({
    type: ShippingAddressDto,
    description: 'Delivery address, stored as-is in the order',
  })
  @IsObject({ message: 'Shipping address is required' })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @ApiProperty({
    example: 'card',
    description:
      '"card" starts a Stripe checkout; any other value places the order directly',
  })
  @IsString({ message: 'Payment method is required' })
  @IsNotEmpty({ message: 'Payment method is required' })
  paymentMethod: string;
}
