import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class GetAdminReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'true = only the hidden reviews, false = only the visible ones. Omit it for all',
  })
  @IsOptional()
  // The text "false" must not become true: compare the text
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean({ message: 'hidden must be true or false' })
  hidden?: boolean;
}
