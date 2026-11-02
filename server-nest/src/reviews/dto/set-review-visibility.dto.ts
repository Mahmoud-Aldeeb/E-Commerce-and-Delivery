import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetReviewVisibilityDto {
  @ApiProperty({
    example: true,
    description: 'true hides the review, false shows it again',
  })
  @IsBoolean({ message: 'isHidden must be true or false' })
  isHidden: boolean;
}
