import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  // GET /api/addresses (also reused as the response of every write)
  async getAddresses(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return { addresses };
  }

  // POST /api/addresses
  async addAddress(userId: string, dto: CreateAddressDto) {
    const existingCount = await this.prisma.address.count({
      where: { userId },
    });

    // The first address of a user is always the default
    const makeDefault = existingCount === 0 ? true : (dto.isDefault ?? false);

    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (makeDefault) {
      operations.push(
        this.prisma.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        }),
      );
    }
    operations.push(
      this.prisma.address.create({
        data: { userId, ...dto, isDefault: makeDefault },
      }),
    );

    // Both steps succeed together or not at all
    await this.prisma.$transaction(operations);

    return this.getAddresses(userId);
  }

  // PUT /api/addresses/:id
  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    // Ownership check first: the address must exist AND belong to this user
    const owned = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Address not found');

    // Same rule as before: empty strings are ignored
    const data: Prisma.AddressUpdateInput = { lat: dto.lat, lng: dto.lng };
    if (dto.label) data.label = dto.label;
    if (dto.address) data.address = dto.address;
    if (dto.city) data.city = dto.city;
    if (dto.state) data.state = dto.state;
    if (dto.zip) data.zip = dto.zip;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;

    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (dto.isDefault) {
      operations.push(
        this.prisma.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        }),
      );
    }
    // userId in the where clause is a second safety net on top of the check above
    operations.push(
      this.prisma.address.update({ where: { id, userId }, data }),
    );

    await this.prisma.$transaction(operations);

    return this.getAddresses(userId);
  }

  // DELETE /api/addresses/:id
  async deleteAddress(userId: string, id: string) {
    // deleteMany never throws when nothing matches, so a missing or foreign id is ignored
    await this.prisma.address.deleteMany({ where: { id, userId } });

    return this.getAddresses(userId);
  }
}
