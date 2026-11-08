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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service.js';
import {
  ApproveReturnDto,
  CompleteReturnDto,
  RejectReturnDto,
} from './dto/return-actions.dto.js';
import { GetAdminReturnsQueryDto } from './dto/get-admin-returns-query.dto.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
// Order matters: AuthGuard sets req.user, then AdminGuard reads it
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the returns by tab, one page at a time (admin only)',
  })
  @ApiOkResponse({
    description: '{ returnRequests, total, page, pages, counts }',
  })
  getReturns(@Query() query: GetAdminReturnsQueryDto) {
    return this.returnsService.getAdminReturns(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a new return request' })
  @ApiOkResponse({ description: '{ returnRequest }' })
  @ApiBadRequestResponse({ description: 'The request is not new' })
  @ApiNotFoundResponse({ description: 'Return not found' })
  approve(@Param('id') id: string, @Body() dto: ApproveReturnDto) {
    return this.returnsService.approve(id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refuse a return, with the reason the customer will read',
  })
  @ApiOkResponse({ description: '{ returnRequest }' })
  @ApiBadRequestResponse({
    description: 'No reason, or the return is already closed',
  })
  @ApiNotFoundResponse({ description: 'Return not found' })
  reject(@Param('id') id: string, @Body() dto: RejectReturnDto) {
    return this.returnsService.reject(id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'The items arrived: put them back on the shelves (or not) and give the money back',
  })
  @ApiOkResponse({ description: '{ returnRequest }' })
  @ApiBadRequestResponse({
    description:
      'The return is not approved, or a cash refund was not confirmed',
  })
  @ApiNotFoundResponse({ description: 'Return not found' })
  complete(@Param('id') id: string, @Body() dto: CompleteReturnDto) {
    return this.returnsService.complete(id, dto);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Try again to refund a completed card return' })
  @ApiOkResponse({ description: '{ returnRequest }' })
  @ApiBadRequestResponse({
    description: 'The refund does not need another try',
  })
  @ApiNotFoundResponse({ description: 'Return not found' })
  retryRefund(@Param('id') id: string) {
    return this.returnsService.retryRefund(id);
  }
}
