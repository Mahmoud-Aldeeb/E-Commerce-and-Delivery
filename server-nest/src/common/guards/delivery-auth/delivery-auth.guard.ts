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
export class DeliveryAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.split(' ')[1];

    let decoded: { id: string; role: string };
    try {
      decoded = this.jwtService.verify<{ id: string; role: string }>(token);
    } catch {
      throw new UnauthorizedException('Token is not valid');
    }

    if (decoded.role !== 'delivery') {
      throw new ForbiddenException('Access denied. Delivery partner only.');
    }

    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { id: decoded.id },
    });

    if (!partner || !partner.isActive) {
      throw new ForbiddenException('Access is deactivated.');
    }

    req.partner = partner;
    return true;
  }
}
