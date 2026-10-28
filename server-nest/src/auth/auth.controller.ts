import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { AuthService } from './auth.service.js';
import {
  AuthResponseDto,
  GoogleAuthResponseDto,
  ProfileResponseDto,
} from './dto/auth-response.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { GoogleAuthDto } from './dto/google-auth.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiCreatedResponse({
    type: AuthResponseDto,
    description: 'Account created successfully',
  })
  @ApiBadRequestResponse({
    description: 'Missing fields, or the email is already registered',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'Logged in successfully',
  })
  @ApiBadRequestResponse({
    description:
      'Email or password is missing, or the account is linked to Google and has no password',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log in (or sign up) with a Google ID token. An existing account with the same verified email is linked, and its password is removed',
  })
  @ApiOkResponse({ type: GoogleAuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'The Google token is invalid, or its email is not verified',
  })
  @ApiConflictResponse({
    description: 'The email is linked to a different Google account',
  })
  googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.googleAuth(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Email a reset link. The answer is the same whether or not the email exists',
  })
  @ApiOkResponse({ description: 'Always { message }' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Choose a new password with the emailed token' })
  @ApiOkResponse({ description: '{ message }' })
  @ApiBadRequestResponse({ description: 'The link is invalid or expired' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // The guard goes on each protected route: register, login, google and the reset routes stay public
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a password to a Google account that has none',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiBadRequestResponse({ description: 'The account already has a password' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  setPassword(@CurrentUser() user: AuthUser, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(user.id, dto);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save the phone number of the current user' })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiBadRequestResponse({ description: 'The phone number is not valid' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }
}
