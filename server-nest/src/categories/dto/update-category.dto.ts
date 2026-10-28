import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto.js';

// Same rules as creating, with every field optional
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
