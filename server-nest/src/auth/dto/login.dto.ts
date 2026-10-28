import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ahmed@example.com' })
  @IsString({ message: 'Please provide email and password' })
  @IsNotEmpty({ message: 'Please provide email and password' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString({ message: 'Please provide email and password' })
  @IsNotEmpty({ message: 'Please provide email and password' })
  password: string;
}
