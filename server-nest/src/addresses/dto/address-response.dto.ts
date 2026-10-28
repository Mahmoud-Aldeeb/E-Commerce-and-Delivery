import { ApiProperty } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ example: 'Home' }) label: string;
  @ApiProperty({ example: '12 Tahrir St' }) address: string;
  @ApiProperty({ example: 'Cairo' }) city: string;
  @ApiProperty({ example: 'Cairo' }) state: string;
  @ApiProperty({ example: '11511' }) zip: string;
  @ApiProperty({ example: true }) isDefault: boolean;
  @ApiProperty({ example: 30.0444 }) lat: number;
  @ApiProperty({ example: 31.2357 }) lng: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class AddressListResponseDto {
  @ApiProperty({ type: [AddressResponseDto] })
  addresses: AddressResponseDto[];
}
