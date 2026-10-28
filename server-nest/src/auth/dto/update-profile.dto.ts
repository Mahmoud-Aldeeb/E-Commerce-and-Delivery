import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

// An optional +, then digits, with spaces, dashes or brackets between them: 7 to 20 characters
const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{5,18}[0-9]$/;
const MESSAGE = 'Enter a valid phone number';

export class UpdateProfileDto {
  @ApiProperty({
    example: '+20 101 234 5678',
    description: 'A phone number the courier can call',
  })
  // Runs before the checks: spaces around the number are not an error
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: MESSAGE })
  @IsNotEmpty({ message: MESSAGE })
  @Matches(PHONE_PATTERN, { message: MESSAGE })
  phone: string;
}
