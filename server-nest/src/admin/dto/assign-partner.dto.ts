import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignPartnerDto {
  @ApiProperty({
    example: '3f2a9c1e-0b7d-4d6e-9a41-5c8e2b7f1a10',
    description: 'Id of the delivery partner',
  })
  @IsString({ message: 'partnerId is required' })
  @IsNotEmpty({ message: 'partnerId is required' })
  partnerId: string;
}
