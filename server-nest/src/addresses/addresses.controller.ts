import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';
import { AddressListResponseDto } from './dto/address-response.dto.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';

@ApiTags('Addresses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
// All routes need a logged-in user, so one guard on the class covers them all
@UseGuards(AuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user addresses, oldest first' })
  @ApiOkResponse({ type: AddressListResponseDto })
  getAddresses(@CurrentUser() user: AuthUser) {
    return this.addressesService.getAddresses(user.id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Add an address. The first address becomes the default automatically',
  })
  @ApiCreatedResponse({
    type: AddressListResponseDto,
    description: 'Returns all addresses of the user',
  })
  @ApiBadRequestResponse({
    description: 'Missing fields or invalid coordinates',
  })
  addAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.addAddress(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Update one of the current user addresses. Coordinates are required',
  })
  @ApiOkResponse({
    type: AddressListResponseDto,
    description: 'Returns all addresses of the user',
  })
  @ApiBadRequestResponse({
    description: 'Invalid fields or invalid coordinates',
  })
  @ApiNotFoundResponse({
    description: 'Address not found (or it belongs to another user)',
  })
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete one of the current user addresses. An unknown id is silently ignored',
  })
  @ApiOkResponse({
    type: AddressListResponseDto,
    description: 'Returns the remaining addresses of the user',
  })
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.addressesService.deleteAddress(user.id, id);
  }
}
