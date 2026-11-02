import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { calculateTotals, roundToCents } from '../orders/order-pricing.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  evaluateCoupon,
  normalizeCode,
  type CouponKind,
} from './coupon-rules.js';
import { CreateCouponDto } from './dto/create-coupon.dto.js';
import { UpdateCouponDto } from './dto/update-coupon.dto.js';
import { ValidateCouponDto } from './dto/validate-coupon.dto.js';

const NOT_VALID = 'This code is not valid';

// An order that really holds a use of a coupon: not cancelled, and (for a card order) paid.
// The count comes from the orders themselves, so a cancellation gives the use back by itself
// and a card checkout that was never paid never takes one
const REDEEMING_ORDERS: Prisma.OrderWhereInput = {
  status: { not: 'Cancelled' },
  NOT: [{ paymentMethod: 'card', isPaid: false }],
};

export interface AppliedCoupon {
  couponId: string;
  code: string;
  type: CouponKind;
  value: number;
  discount: number;
}

// undefined = "not sent" (keep the current value), null = "clear it"
const pick = <T>(sent: T | null | undefined, current: T | null): T | null =>
  sent === undefined ? current : sent;

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  // Checks a code for THIS customer and THIS order, and works out the discount.
  // Used when the customer applies a code, and again when the order is placed
  async resolve(
    userId: string,
    rawCode: string,
    rawSubtotal: number,
  ): Promise<AppliedCoupon> {
    const code = normalizeCode(rawCode);
    const coupon = code
      ? await this.prisma.coupon.findUnique({ where: { code } })
      : null;
    if (!coupon) throw new BadRequestException(NOT_VALID);

    const [redeemedTotal, redeemedByUser] = await Promise.all([
      this.prisma.order.count({
        where: { couponId: coupon.id, ...REDEEMING_ORDERS },
      }),
      this.prisma.order.count({
        where: { couponId: coupon.id, userId, ...REDEEMING_ORDERS },
      }),
    ]);

    const check = evaluateCoupon(coupon, {
      now: new Date(),
      subtotal: roundToCents(rawSubtotal),
      redeemedTotal,
      redeemedByUser,
    });
    if (!check.ok) throw new BadRequestException(check.message);

    return {
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount: check.discount,
    };
  }

  // POST /api/coupons/validate: "what would this order cost with this code?"
  async validate(userId: string, dto: ValidateCouponDto) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map((item) => item.product) } },
      select: { id: true, price: true },
    });
    const prices = new Map(
      products.map((product) => [product.id, product.price]),
    );

    // The prices come from the database: the client only says what and how many
    let itemsTotal = 0;
    for (const item of dto.items) {
      const price = prices.get(item.product);
      if (price === undefined) {
        throw new BadRequestException(
          'A product in your cart is no longer available',
        );
      }
      itemsTotal += price * item.quantity;
    }

    const applied = await this.resolve(userId, dto.code, itemsTotal);
    return {
      coupon: { code: applied.code, type: applied.type, value: applied.value },
      totals: calculateTotals(itemsTotal, applied.discount),
    };
  }

  // ---------- Admin ----------

  private countRedeemed(couponId: string) {
    return this.prisma.order.count({
      where: { couponId, ...REDEEMING_ORDERS },
    });
  }

  private assertConsistent(fields: {
    type: CouponKind;
    value: number;
    maxDiscount: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
  }) {
    if (fields.type === 'PERCENT' && fields.value > 100) {
      throw new BadRequestException('A percentage cannot be more than 100');
    }
    if (fields.type === 'FIXED' && fields.maxDiscount !== null) {
      throw new BadRequestException(
        'A maximum discount only makes sense for a percentage coupon',
      );
    }
    if (
      fields.startsAt &&
      fields.expiresAt &&
      fields.expiresAt.getTime() <= fields.startsAt.getTime()
    ) {
      throw new BadRequestException(
        'The end date must be after the start date',
      );
    }
  }

  // GET /api/coupons
  async getCoupons() {
    const [coupons, counts] = await Promise.all([
      this.prisma.coupon.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.order.groupBy({
        by: ['couponId'],
        where: { couponId: { not: null }, ...REDEEMING_ORDERS },
        _count: { _all: true },
      }),
    ]);
    const redeemed = new Map(
      counts.map((group) => [group.couponId, group._count._all]),
    );

    return {
      coupons: coupons.map((coupon) => ({
        ...coupon,
        redeemedCount: redeemed.get(coupon.id) ?? 0,
      })),
    };
  }

  // POST /api/coupons
  async createCoupon(dto: CreateCouponDto) {
    this.assertConsistent({
      type: dto.type,
      value: dto.value,
      maxDiscount: dto.maxDiscount ?? null,
      startsAt: dto.startsAt ?? null,
      expiresAt: dto.expiresAt ?? null,
    });

    const taken = await this.prisma.coupon.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });
    if (taken)
      throw new ConflictException('A coupon with this code already exists');

    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code,
        type: dto.type,
        value: dto.value,
        maxDiscount: dto.maxDiscount ?? null,
        minSubtotal: dto.minSubtotal ?? null,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return { coupon: { ...coupon, redeemedCount: 0 } };
  }

  // PUT /api/coupons/:id
  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');

    // The final state is checked as a whole: changing only the type can break the other fields
    const next = {
      type: dto.type ?? existing.type,
      value: dto.value ?? existing.value,
      maxDiscount: pick(dto.maxDiscount, existing.maxDiscount),
      minSubtotal: pick(dto.minSubtotal, existing.minSubtotal),
      startsAt: pick(dto.startsAt, existing.startsAt),
      expiresAt: pick(dto.expiresAt, existing.expiresAt),
      usageLimit: pick(dto.usageLimit, existing.usageLimit),
      perUserLimit: pick(dto.perUserLimit, existing.perUserLimit),
      isActive: dto.isActive ?? existing.isActive,
    };
    this.assertConsistent(next);

    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: next,
    });
    return {
      coupon: { ...coupon, redeemedCount: await this.countRedeemed(id) },
    };
  }

  // DELETE /api/coupons/:id
  async deleteCoupon(id: string) {
    const existing = await this.prisma.coupon.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Coupon not found');

    // A coupon that appears on orders stays: deactivating it stops its use and keeps the history
    const used = await this.prisma.order.count({ where: { couponId: id } });
    if (used > 0) {
      throw new ConflictException(
        `This coupon appears on ${used} ${used === 1 ? 'order' : 'orders'}. Deactivate it instead`,
      );
    }

    await this.prisma.coupon.delete({ where: { id } });
    return { message: 'Coupon deleted' };
  }
}
