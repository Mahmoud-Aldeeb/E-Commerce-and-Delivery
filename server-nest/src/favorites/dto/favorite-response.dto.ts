import { ApiProperty } from '@nestjs/swagger';

export class FavoriteIdsResponseDto {
  @ApiProperty({
    type: [String],
    example: ['3f2a9c1e-0b7d-4d6e-9a41-5c8e2b7f1a10'],
    description: 'The ids of the products the user saved',
  })
  ids: string[];
}

export class FavoriteStateResponseDto {
  @ApiProperty({ example: true })
  favorited: boolean;
}
