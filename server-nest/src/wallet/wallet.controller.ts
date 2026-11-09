import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';

@ApiTags('Wallet')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(AuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({
    summary: 'The balance of my store wallet and its history, newest first',
  })
  @ApiOkResponse({
    description: '{ balance, transactions, total, page, pages } (dollars)',
  })
  getWallet(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.walletService.getWallet(user.id, query);
  }
}
