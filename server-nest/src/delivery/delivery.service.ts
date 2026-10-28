import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { appendStatusHistory } from '../common/utils/status-history.util.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto.js';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import {
  ACTIVE_STATUSES,
  FINISHED_STATUSES,
} from '../common/constants/order-status.constants.js';
import { OrderCancellationService } from '../orders/order-cancellation.service.js';
import { pageArgs, pageInfo } from '../common/utils/pagination.util.js';
import { GetDeliveriesQueryDto } from './dto/get-deliveries-query.dto.js';

// The OTP belongs to the customer: it must never be sent to the delivery partner
const HIDE_OTP = { deliveryOtp: true } as const;
const CUSTOMER_FIELDS = { name: true, email: true, phone: true } as const;

@Injectable()
export class DeliveryService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private cancellation: OrderCancellationService,
  ) {}

  // Finds an order that is assigned to THIS partner, or throws 404
  private async findOwnOrder(partnerId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deliveryPartnerId: partnerId },
    });
    if (!order) throw new NotFoundException('Delivery not found');
    return order;
  }

  // POST /api/delivery/login
  async login({ email, password }: LoginDto) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!partner) throw new UnauthorizedException('Invalid email or password');

    const isMatch = await bcrypt.compare(password, partner.password);
    if (!isMatch) throw new UnauthorizedException('Invalid email or password');

    // Checked AFTER the password so strangers cannot learn which accounts are deactivated
    if (!partner.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    // role: 'delivery' is what DeliveryAuthGuard looks for
    const token = this.jwtService.sign({ id: partner.id, role: 'delivery' });
    const { password: _password, ...partnerData } = partner;

    return { partner: partnerData, token };
  }

  // GET /api/delivery/my-deliveries
  async getMyDeliveries(partnerId: string, query: GetDeliveriesQueryDto) {
    const { status, limit, page = 1 } = query;

    const where: Prisma.OrderWhereInput = { deliveryPartnerId: partnerId };
    if (status === 'active') where.status = { in: ACTIVE_STATUSES };
    else if (status === 'completed') where.status = { in: FINISHED_STATUSES };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { user: { select: CUSTOMER_FIELDS } },
        omit: HIDE_OTP,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, ...pageInfo(total, page, limit) };
  }

  // GET /api/delivery/my-deliveries/:id
  async getDeliveryDetail(partnerId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deliveryPartnerId: partnerId },
      include: { user: { select: CUSTOMER_FIELDS } },
      omit: HIDE_OTP,
    });
    if (!order) throw new NotFoundException('Delivery not found');

    return { order };
  }

  // PUT /api/delivery/my-deliveries/:id/complete
  async completeDelivery(
    partnerId: string,
    id: string,
    dto: CompleteDeliveryDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, deliveryPartnerId: partnerId },
    });
    if (!order || FINISHED_STATUSES.includes(order.status)) {
      throw new BadRequestException('Invalid Request');
    }

    if (order.deliveryOtp !== dto.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'Delivered',
        statusHistory: appendStatusHistory(
          order.statusHistory,
          'Delivered',
          'Delivered by partner',
        ),
        deliveryOtp: '', // the code is single-use
      },
      omit: HIDE_OTP,
    });

    return { order: updatedOrder, message: 'Delivery completed successfully' };
  }

  // PUT /api/delivery/my-deliveries/:id/cancel
  async cancelDelivery(partnerId: string, id: string, dto: CancelDeliveryDto) {
    // Ownership first: a partner can only cancel what is assigned to them
    await this.findOwnOrder(partnerId, id);

    const { order } = await this.cancellation.cancel(id, {
      by: 'courier',
      reason: dto.reason,
    });
    const {
      deliveryOtp: _otp,
      paymentIntentId: _pi,
      refundId: _refund,
      ...safeOrder
    } = order;

    return { order: safeOrder, message: 'Delivery cancelled' };
  }

  // PUT /api/delivery/my-deliveries/:id/status
  async updateDeliveryStatus(
    partnerId: string,
    id: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const order = await this.findOwnOrder(partnerId, id);

    // A finished order must not be moved back to an active status
    if (!ACTIVE_STATUSES.includes(order.status)) {
      throw new BadRequestException('Invalid Request');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: dto.status,
        statusHistory: appendStatusHistory(
          order.statusHistory,
          dto.status,
          `Status updated to ${dto.status}`,
        ),
      },
      omit: HIDE_OTP,
    });

    return { order: updatedOrder };
  }

  // PUT /api/delivery/my-deliveries/:id/location
  async updateLocation(
    partnerId: string,
    id: string,
    { lat, lng }: UpdateLocationDto,
  ) {
    const liveLocation = { lat, lng, updatedAt: new Date().toISOString() };

    // One query instead of find + update (this endpoint is called very often)
    const { count } = await this.prisma.order.updateMany({
      where: {
        id,
        deliveryPartnerId: partnerId,
        status: { in: ACTIVE_STATUSES },
      },
      data: { liveLocation },
    });
    if (count === 0) {
      throw new NotFoundException('Delivery not found or not active');
    }

    return { success: true, liveLocation };
  }
}
