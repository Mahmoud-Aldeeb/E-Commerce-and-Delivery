import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Runs before the checks: spaces around the name are removed, and a run of spaces becomes one
const cleanName = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Home & Kitchen',
    description:
      'Unique (ignoring case) and up to 60 characters. Products store it, and it appears in the links',
  })
  @Transform(cleanName)
  @IsString({ message: 'Enter the category name' })
  @IsNotEmpty({ message: 'Enter the category name' })
  @MaxLength(60, { message: 'The name must be 60 characters or fewer' })
  name: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Lower numbers come first. Default: after all the others',
  })
  @IsOptional()
  @IsInt({ message: 'sortOrder must be a whole number' })
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}
