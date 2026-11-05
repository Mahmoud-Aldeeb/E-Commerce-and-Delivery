import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentPartner,
  type AuthPartner,
} from '../common/decorators/current-partner.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { DeliveryAuthGuard } from '../common/guards/delivery-auth/delivery-auth.guard.js';
import { CashService } from './cash.service.js';
import { CashRangeQueryDto } from './dto/cash-range-query.dto.js';
import { RecordSettlementDto } from './dto/record-settlement.dto.js';

@ApiTags('Cash')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
// Order matters: AuthGuard sets req.user, then AdminGuard reads it
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/cash')
export class AdminCashController {
  constructor(private readonly cashService: CashService) {}

  @Get()
  @ApiOperation({
    summary:
      'What every courier collected, handed over and still owes (admin only)',
  })
  @ApiOkResponse({ description: '{ partners, totals }' })
  getOverview() {
    return this.cashService.getOverview();
  }

  @Get('partners/:partnerId')
  @ApiOperation({
    summary:
      'The cash orders, the settlements and the totals by day and by week of one courier (admin only)',
  })
  @ApiOkResponse({
    description:
      '{ partner, balance, range, totals, days, weeks, orders, settlements }',
  })
  @ApiBadRequestResponse({
    description: 'Invalid dates, or a period longer than 92 days',
  })
  @ApiNotFoundResponse({ description: 'Partner not found' })
  getLedger(
    @Param('partnerId') partnerId: string,
    @Query() query: CashRangeQueryDto,
  ) {
    return this.cashService.getPartnerLedger(partnerId, query);
  }

  @Post('partners/:partnerId/settlements')
  @ApiOperation({ summary: 'Record money a courier handed over (admin only)' })
  @ApiCreatedResponse({ description: '{ settlement, balance }' })
  @ApiBadRequestResponse({
    description: 'More than he owes, a date in the future, or invalid fields',
  })
  @ApiNotFoundResponse({ description: 'Partner not found' })
  recordSettlement(
    @CurrentUser() user: AuthUser,
    @Param('partnerId') partnerId: string,
    @Body() dto: RecordSettlementDto,
  ) {
    return this.cashService.recordSettlement(user.id, partnerId, dto);
  }

  @Put('settlements/:id/void')
  @ApiOperation({
    summary:
      'Cancel a wrong settlement: it stops counting, and stays in the history',
  })
  @ApiOkResponse({ description: '{ message }' })
  @ApiNotFoundResponse({ description: 'Settlement not found' })
  voidSettlement(@Param('id') id: string) {
    return this.cashService.voidSettlement(id);
  }
}

@ApiTags('Delivery')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({
  description: 'Not a delivery partner token, or the account is deactivated',
})
@UseGuards(DeliveryAuthGuard)
@Controller('delivery/my-cash')
export class PartnerCashController {
  constructor(private readonly cashService: CashService) {}

  @Get()
  @ApiOperation({
    summary:
      'The cash of the current partner: what he owes, today, this week, the last handovers',
  })
  @ApiOkResponse({ description: '{ balance, today, week, settlements }' })
  getMyCash(@CurrentPartner() partner: AuthPartner) {
    return this.cashService.getMyCash(partner.id);
  }
}
