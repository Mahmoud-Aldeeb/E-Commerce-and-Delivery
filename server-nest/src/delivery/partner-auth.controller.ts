import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { PartnerLoginResponseDto } from './dto/delivery-response.dto.js';

// Public on purpose: the partner has no token yet. No guard here.
@ApiTags('Delivery')
@Controller('delivery')
export class PartnerAuthController {
  constructor(private readonly deliveryService: DeliveryService) {}

  // The old API answered 200 here; Nest defaults to 201 for POST
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in as a delivery partner' })
  @ApiOkResponse({ type: PartnerLoginResponseDto })
  @ApiBadRequestResponse({ description: 'Email or password is missing' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'Account has been deactivated' })
  login(@Body() dto: LoginDto) {
    return this.deliveryService.login(dto);
  }
}
