import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const FIELDS_MESSAGE = 'Please provide all required fields';

export class CreateDeliveryPartnerDto {
  @ApiProperty({ example: 'Omar Hassan' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  name: string;

  @ApiProperty({
    example: 'omar@example.com',
    description: 'Stored in lowercase. The partner logs in with it',
  })
  @IsEmail({}, { message: 'Please provide a valid email' })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Initial password of the partner',
  })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  password: string;

  @ApiProperty({ example: '01012345678' })
  @IsString({ message: FIELDS_MESSAGE })
  @IsNotEmpty({ message: FIELDS_MESSAGE })
  phone: string;

  @ApiPropertyOptional({ example: 'bike', description: 'Defaults to "bike"' })
  @IsOptional()
  @IsString()
  vehicleType?: string;
}
