import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { UploadResponseDto } from './dto/upload-response.dto.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';

// Vercel rejects any request body above 4.5 MB before it reaches the app
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB (also Cloudinary's free-plan limit)
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

// Runs while multer reads the upload: reject non-image types before buffering the file
const imageFilter = (
  _req: unknown,
  file: { mimetype: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    callback(
      new BadRequestException(
        'Only JPEG, PNG, WebP, GIF or AVIF images are allowed',
      ),
      false,
    );
    return;
  }
  callback(null, true);
};
type UploadedImage = { buffer: Buffer };
@ApiTags('Upload')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  // The old API answered 200 here; Nest defaults to 201 for POST
  @Post()
  @HttpCode(HttpStatus.OK)
  // 'image' is the form field name the frontend already uses.
  // With no dest/storage option, multer keeps the file in memory (file.buffer).
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: imageFilter,
    }),
  )
  @ApiOperation({ summary: 'Upload an image to Cloudinary and get its url' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: UploadResponseDto })
  @ApiBadRequestResponse({
    description:
      'No file, wrong field name, or the file is not an allowed image type',
  })
  @ApiPayloadTooLargeResponse({ description: 'The image is larger than 4 MB' })
  @ApiInternalServerErrorResponse({
    description: 'Cloudinary rejected or failed the upload',
  })
  async uploadImage(@UploadedFile() file: UploadedImage) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    const url = await this.cloudinaryService.uploadImage(file.buffer);
    return { url };
  }
}
