import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'No token provided, authorization denied',
      );
    }

    const token = authHeader.split(' ')[1];

    // "v" is the token version. Tokens issued before it existed have no "v": they count as 0
    let decoded: { id?: string; v?: number; role?: string };

    try {
      decoded = this.jwtService.verify<{
        id?: string;
        v?: number;
        role?: string;
      }>(token);
    } catch {
      throw new UnauthorizedException('Token is not valid');
    }
    // Delivery partner tokens are only valid on DeliveryAuthGuard routes
    if (decoded.role === 'delivery') {
      throw new ForbiddenException('Access denied');
    }

    const userId = decoded.id;
    if (typeof userId !== 'string') {
      throw new UnauthorizedException('Token is not valid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });

    // No user: it was deleted. A different version: the sessions were cancelled
    // (the account was linked to Google, or its password was reset)
    if (!user || user.tokenVersion !== (decoded.v ?? 0)) {
      throw new UnauthorizedException('Token is not valid');
    }

    req.user = { id: userId };
    return true;
  }
}
