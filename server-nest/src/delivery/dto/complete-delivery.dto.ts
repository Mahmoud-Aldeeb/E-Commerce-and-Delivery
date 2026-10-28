import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CompleteDeliveryDto {
  @ApiProperty({
    example: '482913',
    description: 'One-time code the customer gives to the delivery partner',
  })
  @IsString({ message: 'Invalid OTP' })
  @IsNotEmpty({ message: 'Invalid OTP' })
  otp: string;
}
