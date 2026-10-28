import {
  Body,
  Controller,
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
import { AdminService } from './admin.service.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto.js';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto.js';
import { AssignPartnerDto } from './dto/assign-partner.dto.js';
import {
  AdminStatsResponseDto,
  PartnerItemResponseDto,
  PartnerListResponseDto,
} from './dto/admin-response.dto.js';
import {
  CancelOrderResponseDto,
  OrderItemResultDto,
} from '../orders/dto/order-response.dto.js';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
// Order matters: AuthGuard sets req.user, then AdminGuard reads it
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard numbers and the 8 newest orders' })
  @ApiOkResponse({ type: AdminStatsResponseDto })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('delivery-partners')
  @ApiOperation({ summary: 'List all delivery partners, newest first' })
  @ApiOkResponse({ type: PartnerListResponseDto })
  getDeliveryPartners() {
    return this.adminService.getDeliveryPartners();
  }

  @Post('delivery-partners')
  @ApiOperation({ summary: 'Create a delivery partner account' })
  @ApiCreatedResponse({ type: PartnerItemResponseDto })
  @ApiBadRequestResponse({
    description: 'Missing required fields or invalid email',
  })
  @ApiConflictResponse({
    description: 'A partner with this email already exists',
  })
  createDeliveryPartner(@Body() dto: CreateDeliveryPartnerDto) {
    return this.adminService.createDeliveryPartner(dto);
  }

  @Put('delivery-partners/:id')
  @ApiOperation({
    summary: 'Update a delivery partner (name, phone, vehicle, active flag)',
  })
  @ApiOkResponse({ type: PartnerItemResponseDto })
  @ApiNotFoundResponse({ description: 'Partner not found' })
  updateDeliveryPartner(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryPartnerDto,
  ) {
    return this.adminService.updateDeliveryPartner(id, dto);
  }

  @Put('orders/:id/assign')
  @ApiOperation({
    summary:
      'Assign an order to a delivery partner and generate its 6-digit OTP',
  })
  @ApiOkResponse({ type: OrderItemResultDto })
  @ApiBadRequestResponse({
    description:
      'partnerId missing, partner not active, or the order is already finished',
  })
  @ApiNotFoundResponse({ description: 'Order or partner not found' })
  assignDeliveryPartner(
    @Param('id') id: string,
    @Body() dto: AssignPartnerDto,
  ) {
    return this.adminService.assignDeliveryPartner(id, dto);
  }

  @Post('orders/:id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Try again to refund a cancelled card order (admin only)',
  })
  @ApiOkResponse({ type: CancelOrderResponseDto })
  @ApiBadRequestResponse({ description: 'The order is not cancelled' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  retryRefund(@Param('id') id: string) {
    return this.adminService.retryRefund(id);
  }
}
