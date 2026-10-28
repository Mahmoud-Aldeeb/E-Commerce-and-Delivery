import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto.js';
import {
  CancelOrderResponseDto,
  CreateOrderResponseDto,
  OrderItemResultDto,
  PagedAdminOrderListResponseDto,
  OrderLocationResponseDto,
  PagedOrderListResponseDto,
} from './dto/order-response.dto.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { GetAllOrdersQueryDto } from './dto/get-all-orders-query.dto.js';

@ApiTags('Orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
// Every route here needs a logged-in user, so the guard goes on the class.
// Class-level guards run before method-level guards (e.g. AdminGuard below).
@UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  // The old API answered 200 for this route; Nest defaults to 201 for POST
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Place an order. Card payments return a Stripe checkout URL, others return the order',
  })
  @ApiOkResponse({ type: CreateOrderResponseDto })
  @ApiBadRequestResponse({
    description:
      'No items, invalid quantity, or missing shipping address / payment method',
  })
  @ApiNotFoundResponse({
    description: 'A product is out of stock or does not exist',
  })
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    // Used to build Stripe's success and cancel URLs
    @Headers('origin') origin?: string,
  ) {
    return this.ordersService.createOrder(user.id, dto, origin);
  }

  @Get()
  @ApiOperation({
    summary:
      'List the current user orders, one page at a time (unpaid card orders are hidden)',
  })
  @ApiOkResponse({ type: PagedOrderListResponseDto })
  getUserOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: GetOrdersQueryDto,
  ) {
    return this.ordersService.getUserOrders(user.id, query);
  }
  // Must stay above @Get(':id'), otherwise ":id" would capture the word "all"
  @Get('all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all orders, one page at a time (admin only)' })
  @ApiOkResponse({ type: PagedAdminOrderListResponseDto })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  getAllOrders(@Query() query: GetAllOrdersQueryDto) {
    return this.ordersService.getAllOrders(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of the current user orders by id' })
  @ApiOkResponse({ type: OrderItemResultDto })
  @ApiNotFoundResponse({
    description: 'Order not found (or it belongs to another user)',
  })
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getOrder(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel one of the current user orders before it is packed. Items return to stock and card payments are refunded',
  })
  @ApiOkResponse({ type: CancelOrderResponseDto })
  @ApiBadRequestResponse({
    description: 'The order can no longer be cancelled',
  })
  @ApiNotFoundResponse({
    description: 'Order not found (or it belongs to another user)',
  })
  cancelOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelMyOrder(user.id, id, dto);
  }

  @Put(':id/status')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Update an order status and append it to the status history (admin only)',
  })
  @ApiOkResponse({ type: OrderItemResultDto })
  @ApiBadRequestResponse({ description: 'Status is missing' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, dto);
  }

  // PUT (not GET) on purpose: this is how the existing frontend calls it
  @Put(':id/location')
  @ApiOperation({
    summary:
      'Get the live location and status of one of the current user orders',
  })
  @ApiOkResponse({ type: OrderLocationResponseDto })
  @ApiNotFoundResponse({
    description: 'Order not found (or it belongs to another user)',
  })
  getOrderLocation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getOrderLocation(user.id, id);
  }
}
