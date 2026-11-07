import { ApiProperty } from '@nestjs/swagger';

export class FilterColorDto {
  @ApiProperty({ example: 'Black' })
  name: string;

  @ApiProperty({ example: '#111827', nullable: true, type: String })
  hex: string | null;
}

export class FilterOptionsResponseDto {
  @ApiProperty({ type: [String], example: ['S', 'M', 'L'] })
  sizes: string[];

  @ApiProperty({ type: [FilterColorDto] })
  colors: FilterColorDto[];
}
