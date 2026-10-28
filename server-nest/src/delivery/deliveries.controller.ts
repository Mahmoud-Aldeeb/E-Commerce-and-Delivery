import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service.js';
import { DeliveryAuthGuard } from '../common/guards/delivery-auth/delivery-auth.guard.js';
import {
  CurrentPartner,
  type AuthPartner,
} from '../common/decorators/current-partner.decorator.js';
import { GetDeliveriesQueryDto } from './dto/get-deliveries-query.dto.js';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto.js';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import {
  DeliveryActionResponseDto,
  DeliveryItemResponseDto,
  DeliveryListResponseDto,
  LocationUpdateResponseDto,
} from './dto/delivery-response.dto.js';

@ApiTags('Delivery')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({
  description: 'Not a delivery partner token, or the account is deactivated',
})
// Every route here is for logged-in delivery partners only
@UseGuards(DeliveryAuthGuard)
@Controller('delivery/my-deliveries')
export class DeliveriesController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  @ApiOperation({ summary: 'List deliveries assigned to the current partner' })
  @ApiOkResponse({ type: DeliveryListResponseDto })
  getMyDeliveries(
    @CurrentPartner() partner: AuthPartner,
    @Query() query: GetDeliveriesQueryDto,
  ) {
    return this.deliveryService.getMyDeliveries(partner.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one delivery assigned to the current partner' })
  @ApiOkResponse({ type: DeliveryItemResponseDto })
  @ApiNotFoundResponse({
    description: 'Delivery not found (or assigned to someone else)',
  })
  getDeliveryDetail(
    @CurrentPartner() partner: AuthPartner,
    @Param('id') id: string,
  ) {
    return this.deliveryService.getDeliveryDetail(partner.id, id);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: 'Complete a delivery using the customer OTP' })
  @ApiOkResponse({ type: DeliveryActionResponseDto })
  @ApiBadRequestResponse({
    description:
      'Wrong or missing OTP, or the order is not assigned to you / already finished',
  })
  completeDelivery(
    @CurrentPartner() partner: AuthPartner,
    @Param('id') id: string,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return this.deliveryService.completeDelivery(partner.id, id, dto);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: 'Cancel a delivery (not allowed once delivered)' })
  @ApiOkResponse({ type: DeliveryActionResponseDto })
  @ApiBadRequestResponse({ description: 'The order was already delivered' })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  cancelDelivery(
    @CurrentPartner() partner: AuthPartner,
    @Param('id') id: string,
    @Body() dto: CancelDeliveryDto,
  ) {
    return this.deliveryService.cancelDelivery(partner.id, id, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Set the status to "Packed" or "Out for Delivery"' })
  @ApiOkResponse({ type: DeliveryItemResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid status, or the order is already finished',
  })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  updateDeliveryStatus(
    @CurrentPartner() partner: AuthPartner,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.updateDeliveryStatus(partner.id, id, dto);
  }

  @Put(':id/location')
  @ApiOperation({ summary: 'Update the live location of an active delivery' })
  @ApiOkResponse({ type: LocationUpdateResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid coordinates' })
  @ApiNotFoundResponse({ description: 'Delivery not found or not active' })
  updateLocation(
    @CurrentPartner() partner: AuthPartner,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.deliveryService.updateLocation(partner.id, id, dto);
  }
}
