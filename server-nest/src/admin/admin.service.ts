import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { HIDE_UNPAID_CARD_ORDERS } from '../orders/orders.service.js';
import { FINISHED_STATUSES } from '../common/constants/order-status.constants.js';
import { appendStatusHistory } from '../common/utils/status-history.util.js';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto.js';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto.js';
import { AssignPartnerDto } from './dto/assign-partner.dto.js';
import { OrderCancellationService } from '../orders/order-cancellation.service.js';

// The password hash must never leave the server
const HIDE_PASSWORD = { password: true } as const;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private cancellation: OrderCancellationService,
  ) {}

  // GET /api/admin/stats
  async getStats() {
    // Promise.all runs the six queries at the same time instead of one after another
    const [
      totalOrders,
      totalUsers,
      totalProducts,
      outOfStock,
      totalPartners,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.count({ where: HIDE_UNPAID_CARD_ORDERS }),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { stock: 0 } }),
      this.prisma.deliveryPartner.count(),
      this.prisma.order.findMany({
        where: HIDE_UNPAID_CARD_ORDERS,
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: { select: { name: true, email: true } },
          deliveryPartner: { select: { name: true, phone: true } },
        },
      }),
    ]);

    return {
      totalOrders,
      totalUsers,
      totalProducts,
      outOfStock,
      totalPartners,
      recentOrders,
    };
  }

  // GET /api/admin/delivery-partners
  async getDeliveryPartners() {
    const partners = await this.prisma.deliveryPartner.findMany({
      omit: HIDE_PASSWORD,
      orderBy: { createdAt: 'desc' },
    });
    return { partners };
  }

  // POST /api/admin/delivery-partners
  async createDeliveryPartner(dto: CreateDeliveryPartnerDto) {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.deliveryPartner.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Delivery partner already exists with this email',
      );
    }

    const partner = await this.prisma.deliveryPartner.create({
      data: {
        name: dto.name,
        email,
        password: await bcrypt.hash(dto.password, 10),
        phone: dto.phone,
        vehicleType: dto.vehicleType,
      },
      omit: HIDE_PASSWORD,
    });

    return { partner };
  }

  // PUT /api/admin/delivery-partners/:id
  async updateDeliveryPartner(id: string, dto: UpdateDeliveryPartnerDto) {
    const exists = await this.prisma.deliveryPartner.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Partner not found');

    // Same rule as before: empty strings are ignored
    const data: Prisma.DeliveryPartnerUpdateInput = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone) data.phone = dto.phone;
    if (dto.vehicleType) data.vehicleType = dto.vehicleType;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const partner = await this.prisma.deliveryPartner.update({
      where: { id },
      data,
      omit: HIDE_PASSWORD,
    });

    return { partner };
  }

  // PUT /api/admin/orders/:id/assign
  async assignDeliveryPartner(
    orderId: string,
    { partnerId }: AssignPartnerDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw new NotFoundException('Partner not found');

    // A deactivated partner cannot log in, so the order would be stuck with them
    if (!partner.isActive) {
      throw new BadRequestException('Delivery partner is not active');
    }
    if (FINISHED_STATUSES.includes(order.status)) {
      throw new BadRequestException('Cannot assign a finished order');
    }

    // 6-digit code from a secure random source (randomInt max is exclusive)
    const otp = String(randomInt(100000, 1000000));

    const data: Prisma.OrderUncheckedUpdateInput = {
      deliveryPartnerId: partner.id,
      deliveryOtp: otp,
    };

    // Only brand-new orders move to "Assigned"; later statuses stay as they are
    if (order.status === 'Placed' || order.status === 'Confirmed') {
      data.status = 'Assigned';
      data.statusHistory = appendStatusHistory(
        order.statusHistory,
        'Assigned',
        `Assigned to ${partner.name}`,
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data,
    });

    return { order: updatedOrder };
  }

  // POST /api/admin/orders/:id/refund
  async retryRefund(orderId: string) {
    const { order, outcome } = await this.cancellation.retryRefund(orderId);
    return { order, refund: outcome };
  }
}
