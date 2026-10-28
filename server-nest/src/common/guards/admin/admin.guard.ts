import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Role } from '../../../generated/prisma/enums.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const reqUser = req.user;
    if (!reqUser?.id) {
      throw new UnauthorizedException('Unauthorized');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: reqUser.id },
    });
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    if (dbUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }

    reqUser.isAdmin = true;
    return true;
  }
}
