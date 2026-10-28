import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/grocery-del/abc123.jpg',
    description: 'Public HTTPS url of the uploaded image',
  })
  url: string;
}
