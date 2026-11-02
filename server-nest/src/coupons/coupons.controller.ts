import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { MessageResponseDto } from '../common/dto/message-response.dto.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { CouponsService } from './coupons.service.js';
import { CreateCouponDto } from './dto/create-coupon.dto.js';
import { UpdateCouponDto } from './dto/update-coupon.dto.js';
import { ValidateCouponDto } from './dto/validate-coupon.dto.js';

@ApiTags('Coupons')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
// Every route needs a logged-in user. Class-level guards run before method-level ones (AdminGuard)
@UseGuards(AuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // Must stay above the ":id" routes
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check a code for these items: the discount and the totals the order would have',
  })
  @ApiOkResponse({ description: '{ coupon: { code, type, value }, totals }' })
  @ApiBadRequestResponse({
    description: 'The code is not valid for this customer or these items',
  })
  validate(@CurrentUser() user: AuthUser, @Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(user.id, dto);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'List the coupons, with how many orders used each (admin only)',
  })
  @ApiOkResponse({ description: '{ coupons }' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  getCoupons() {
    return this.couponsService.getCoupons();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a coupon (admin only)' })
  @ApiCreatedResponse({ description: '{ coupon }' })
  @ApiBadRequestResponse({ description: 'Invalid fields' })
  @ApiConflictResponse({ description: 'The code is already used' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.couponsService.createCoupon(dto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Change a coupon (admin only). The code itself never changes',
  })
  @ApiOkResponse({ description: '{ coupon }' })
  @ApiBadRequestResponse({ description: 'Invalid fields' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Coupon not found' })
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.updateCoupon(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a coupon that no order used (admin only)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Coupon not found' })
  @ApiConflictResponse({ description: 'Orders used it: deactivate it instead' })
  deleteCoupon(@Param('id') id: string) {
    return this.couponsService.deleteCoupon(id);
  }
}
