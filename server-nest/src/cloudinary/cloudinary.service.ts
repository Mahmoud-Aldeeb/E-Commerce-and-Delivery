import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { v2 as cloudinary } from 'cloudinary';
import cloudinaryPackage from 'cloudinary';

const cloudinary = cloudinaryPackage.v2;

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly folder: string;

  constructor(private config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });

    // Defaults to the old folder name, so nothing changes unless you set the variable
    this.folder = this.config.get<string>('CLOUDINARY_FOLDER') ?? 'grocery-del';
  }

  get client() {
    return cloudinary;
  }

  // Uploads an in-memory image and returns its public HTTPS url
  async uploadImage(buffer: Buffer): Promise<string> {
    try {
      return await new Promise<string>((resolve, reject) => {
        // upload_stream sends the raw bytes (no base64 conversion needed)
        const stream = cloudinary.uploader.upload_stream(
          { folder: this.folder, resource_type: 'image' },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('Empty response from Cloudinary'));
              return;
            }
            resolve(result.secure_url);
          },
        );
        stream.end(buffer);
      });
    } catch (error) {
      // Cloudinary errors are often plain objects, not Error instances
      const details =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Image upload failed: ${details}`);
      throw new InternalServerErrorException('Image upload failed');
    }
  }
}
