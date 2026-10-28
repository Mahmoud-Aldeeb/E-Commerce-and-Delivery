import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: ['Packed', 'Out for Delivery'], example: 'Packed' })
  @IsIn(['Packed', 'Out for Delivery'], { message: 'Invalid status update' })
  status: string;
}
