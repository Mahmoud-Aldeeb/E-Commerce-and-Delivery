import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';

@ApiTags('Returns')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(AuthGuard)
// No path here: the routes live under /orders/:orderId/returns and /returns
@Controller()
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get('orders/:orderId/returns')
  @ApiOperation({
    summary:
      'Can this order be returned? What is left to return, and the returns of this order',
  })
  @ApiOkResponse({
    description: '{ eligibility, windowDays, lines, returnRequests }',
  })
  @ApiNotFoundResponse({
    description: 'Order not found (or it belongs to another user)',
  })
  getOrderReturns(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.returnsService.getOrderReturns(user.id, orderId);
  }

  @Post('orders/:orderId/returns')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ask to return items of a delivered order (within the return days)',
  })
  @ApiOkResponse({ description: '{ returnRequest }' })
  @ApiBadRequestResponse({
    description: 'Not delivered, too late, or more than what is left to return',
  })
  @ApiNotFoundResponse({
    description: 'Order not found (or it belongs to another user)',
  })
  createReturn(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReturnDto,
  ) {
    return this.returnsService.createReturn(user.id, orderId, dto);
  }

  @Get('returns')
  @ApiOperation({ summary: 'List my returns, newest first' })
  @ApiOkResponse({ description: '{ returnRequests, total, page, pages }' })
  getMyReturns(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.returnsService.getMyReturns(user.id, query);
  }

  @Post('returns/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel my return while the store has not answered',
  })
  @ApiOkResponse({ description: '{ returnRequest }' })
  @ApiBadRequestResponse({ description: 'The store already answered' })
  @ApiNotFoundResponse({
    description: 'Return not found (or it belongs to another user)',
  })
  cancelReturn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.returnsService.cancelMyReturn(user.id, id);
  }
}
