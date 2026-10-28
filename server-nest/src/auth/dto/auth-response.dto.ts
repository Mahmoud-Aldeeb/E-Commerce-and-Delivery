import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';

export class UserResponseDto {
  @ApiProperty({ example: 'clx1abc...' })
  id: string;

  @ApiProperty({ example: 'Ahmed Ali' })
  name: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({
    example: false,
    description: 'True when the user role is ADMIN',
  })
  isAdmin: boolean;

  @ApiProperty({
    example: true,
    description: 'False for a Google account that has no password yet',
  })
  hasPassword: boolean;

  @ApiProperty({
    example: false,
    description: 'True when a Google account is linked',
  })
  hasGoogle: boolean;

  @ApiPropertyOptional({ example: '01012345678', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  avatar: string | null;

  @ApiPropertyOptional({
    description: 'User addresses (returned by login and Google sign-in only)',
    type: 'array',
    items: { type: 'object' },
  })
  addresses?: object[];
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
    description: 'JWT token, valid for 30 days',
  })
  token: string;
}

export class GoogleAuthResponseDto extends AuthResponseDto {
  @ApiProperty({
    example: false,
    description:
      'True when an existing password was removed because the account got linked to Google',
  })
  passwordRemoved: boolean;
}

export class ProfileResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
