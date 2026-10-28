import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { Role } from '../generated/prisma/enums.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { GoogleAuthDto } from './dto/google-auth.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';

const BRAND = 'Cartly';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const WITH_ADDRESSES = { addresses: true } as const;

// The same answer for every email: nobody can learn who is registered
const FORGOT_PASSWORD_RESPONSE = {
  message: 'If that email exists, a reset link has been sent.',
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// Anything a user typed must be escaped before it goes inside an HTML email
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClientId: string;
  private readonly googleClient: OAuth2Client;
  private readonly clientUrl: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {
    this.googleClientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(this.googleClientId);

    // Reset links are built from this address: in production it must be set on purpose
    const configuredUrl = this.config.get<string>('CLIENT_URL');
    if (!configuredUrl && process.env.NODE_ENV === 'production') {
      throw new Error('CLIENT_URL is required in production');
    }
    this.clientUrl = (configuredUrl ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  // "v" ties the token to the user's current tokenVersion: raising the version cancels every older token
  private generateToken(user: { id: string; tokenVersion: number }) {
    return this.jwtService.sign({ id: user.id, v: user.tokenVersion });
  }

  // What the client may see. Secrets never leave the server:
  // the client only learns WHETHER a password / Google link exists
  private toUserResponse<
    T extends {
      password: string | null;
      googleId: string | null;
      passwordResetToken: string | null;
      passwordResetExpires: Date | null;
      tokenVersion: number;
      role: Role;
    },
  >(user: T) {
    const {
      password,
      googleId,
      passwordResetToken: _passwordResetToken,
      passwordResetExpires: _passwordResetExpires,
      tokenVersion: _tokenVersion,
      ...rest
    } = user;
    return {
      ...rest,
      isAdmin: user.role === Role.ADMIN,
      hasPassword: password !== null,
      hasGoogle: googleId !== null,
    };
  }

  // ─── Register ─────────────────────────────────────────────────────────────

  async register({ name, email, password }: RegisterDto) {
    const normalizedEmail = email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new BadRequestException('User already exists with this email');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: { name, email: normalizedEmail, password: hashedPassword },
    });

    return {
      user: this.toUserResponse(user),
      token: this.generateToken(user),
    };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login({ email, password }: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: WITH_ADDRESSES,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Google-only account: no password set yet
    if (!user.password) {
      throw new BadRequestException(
        'This account is linked to Google. Please sign in with Google, or use "Forgot Password" to create a password for your account.',
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: this.toUserResponse(user),
      token: this.generateToken(user),
    };
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────

  // Checks the ID token with Google and returns only what we need from it
  private async verifyGoogleToken(idToken: string) {
    const payload = await this.googleClient
      .verifyIdToken({ idToken, audience: this.googleClientId })
      .then((ticket) => ticket.getPayload())
      .catch(() => {
        throw new UnauthorizedException('Invalid Google token');
      });

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google did not return an email');
    }
    // Linking by an email Google did not verify would let anyone claim any account
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Your Google email is not verified');
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name,
      picture: payload.picture,
    };
  }

  async googleAuth({ idToken }: GoogleAuthDto) {
    const { googleId, email, name, picture } =
      await this.verifyGoogleToken(idToken);

    // 1) A returning Google user: the Google id is the identity
    let user = await this.prisma.user.findUnique({
      where: { googleId },
      include: WITH_ADDRESSES,
    });
    let passwordRemoved = false;

    if (!user) {
      const sameEmail = await this.prisma.user.findUnique({
        where: { email },
        include: WITH_ADDRESSES,
      });

      if (sameEmail) {
        // 2) Account linking. An email already tied to ANOTHER Google account is not ours to take
        if (sameEmail.googleId) {
          throw new ConflictException(
            'This email is already linked to a different Google account',
          );
        }

        // The old password is removed: whoever registered this email first (maybe not
        // its owner) must not keep a way in. The owner can set a new one any time.
        passwordRemoved = sameEmail.password !== null;
        user = await this.prisma.user.update({
          where: { id: sameEmail.id },
          data: {
            googleId,
            password: null,
            passwordResetToken: null,
            passwordResetExpires: null,
            // Every token issued before the link stops working
            tokenVersion: { increment: 1 },
            ...(picture && !sameEmail.avatar ? { avatar: picture } : {}),
          },
          include: WITH_ADDRESSES,
        });
      } else {
        // 3) A new user: an account without a password
        user = await this.prisma.user.create({
          data: {
            name: name ?? 'Google User',
            email,
            password: null,
            googleId,
            avatar: picture ?? '',
          },
          include: WITH_ADDRESSES,
        });
      }
    }

    return {
      user: this.toUserResponse(user),
      token: this.generateToken(user),
      passwordRemoved,
    };
  }

  // ─── Update Profile (phone) ───────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: dto.phone },
    });

    return { user: this.toUserResponse(user) };
  }

  // ─── Set Password (a logged-in Google user adds a password) ───────────────

  async setPassword(userId: string, { password }: SetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.password) {
      throw new BadRequestException(
        'Your account already has a password. Use "Forgot Password" to change it.',
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { user: this.toUserResponse(updated) };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword({ email }: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) return FORGOT_PASSWORD_RESPONSE;

    // Only the hash of the token is stored: a database leak does not leak working links
    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: sha256(rawToken),
        passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetLink = `${this.clientUrl}/reset-password?token=${rawToken}`;

    // A failed email must not change the answer: it would reveal which emails exist
    try {
      await this.mail.sendEmail({
        to: user.email,
        subject: 'Reset your password',
        body: this.resetPasswordEmail(user.name, resetLink),
      });
    } catch (error) {
      this.logger.error(
        `Could not send the reset email to user ${user.id}: ${(error as Error).message}`,
      );
    }

    return FORGOT_PASSWORD_RESPONSE;
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  async resetPassword({ token, password }: ResetPasswordDto) {
    const hashedToken = sha256(token);
    const hashedPassword = await bcrypt.hash(password, 10);

    // One statement checks the token, checks the expiry and uses the token up.
    // Two requests with the same link cannot both pass: the second finds count = 0
    const { count } = await this.prisma.user.updateMany({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gt: new Date() },
      },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        // The old sessions end: whoever knew the old password is out
        tokenVersion: { increment: 1 },
      },
    });

    if (count === 0) {
      throw new BadRequestException(
        'This reset link is invalid or has expired.',
      );
    }

    return { message: 'Password reset successfully. You can now sign in.' };
  }

  // ─── Email template ───────────────────────────────────────────────────────

  private resetPasswordEmail(name: string, resetLink: string): string {
    return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
          <tr>
            <td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                style="background:#fff;border-radius:12px;overflow:hidden;
                       box-shadow:0 1px 3px rgba(0,0,0,.08)">
                <tr>
                  <td style="background:#111827;padding:28px 40px">
                    <p style="margin:0;color:#fff;font-size:20px;font-weight:700">
                      ${BRAND}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:36px 40px">
                    <h1 style="margin:0 0 8px;font-size:22px;color:#111827">
                      Reset your password
                    </h1>
                    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
                      Hi ${escapeHtml(name)},<br><br>
                      We received a request to reset the password for your account.
                      Click the button below to choose a new password.
                      This link will expire in <strong>1 hour</strong>.
                    </p>
                    <a href="${resetLink}"
                      style="display:inline-block;background:#111827;color:#fff;
                             text-decoration:none;padding:14px 32px;border-radius:8px;
                             font-size:15px;font-weight:600">
                      Reset password
                    </a>
                    <p style="margin:24px 0 0;color:#9ca3af;font-size:13px">
                      If you did not request a password reset, you can safely ignore
                      this email — your password will not be changed.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px;border-top:1px solid #f3f4f6">
                    <p style="margin:0;color:#9ca3af;font-size:12px">
                      If the button doesn't work, copy and paste this link:<br>
                      <a href="${resetLink}" style="color:#6b7280">${resetLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;
  }
}
