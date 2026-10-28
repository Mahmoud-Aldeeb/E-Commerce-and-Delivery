import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ahmed Ali', description: 'Full name of the user' })
  @IsString({ message: 'Please provide all fields' })
  @IsNotEmpty({ message: 'Please provide all fields' })
  name: string;

  @ApiProperty({
    example: 'ahmed@example.com',
    description: 'Email address (stored in lowercase)',
  })
  @IsEmail({}, { message: 'Please provide a valid email' })
  @IsNotEmpty({ message: 'Please provide all fields' })
  email: string;

  @ApiProperty({ example: '123456', description: 'Account password' })
  @IsString({ message: 'Please provide all fields' })
  @IsNotEmpty({ message: 'Please provide all fields' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
