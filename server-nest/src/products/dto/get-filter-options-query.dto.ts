import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetFilterOptionsQueryDto {
  @ApiPropertyOptional({
    example: 'Fashion',
    description:
      'Only look inside this category. "all" (or nothing) = every category',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}
