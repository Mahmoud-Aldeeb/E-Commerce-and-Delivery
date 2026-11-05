import type {
  Prisma,
  PrismaClient,
} from '../../src/generated/prisma/client.js';

// Every product needs a category that exists (the foreign key of the schema)
export const CATEGORY = 'Test';

export const ADDRESS = {
  label: 'Home',
  address: '12 Nile St',
  city: 'Cairo',
  state: 'Cairo',
  zip: '11511',
  lat: 30,
  lng: 31,
};

export const imageOf = (productId: string) =>
  `https://placehold.co/${productId}.png`;

// One line of the items an order remembers
export const line = (
  product: string,
  quantity: number,
  price: number,
  name = `Product ${product}`,
) => ({
  product,
  name,
  image: imageOf(product),
  price,
  quantity,
});

export function makeUser(
  prisma: PrismaClient,
  id: string,
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  return prisma.user.create({
    data: {
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
      phone: '+20 101 234 5678', // an order needs one: the courier calls it
      password: null,
      ...overrides,
    } as Prisma.UserUncheckedCreateInput,
  });
}

export async function makeProduct(
  prisma: PrismaClient,
  id: string,
  overrides: Partial<Prisma.ProductUncheckedCreateInput> = {},
) {
  await prisma.category.upsert({
    where: { name: CATEGORY },
    update: {},
    create: { name: CATEGORY },
  });
  return prisma.product.create({
    data: {
      id,
      name: `Product ${id}`,
      price: 10,
      image: imageOf(id),
      category: CATEGORY,
      stock: 10,
      ...overrides,
    } as Prisma.ProductUncheckedCreateInput,
  });
}

export function makePartner(
  prisma: PrismaClient,
  id: string,
  overrides: Partial<Prisma.DeliveryPartnerUncheckedCreateInput> = {},
) {
  return prisma.deliveryPartner.create({
    data: {
      id,
      name: 'Omar',
      email: `${id}@example.com`,
      password: 'hash',
      phone: '0100',
      ...overrides,
    } as Prisma.DeliveryPartnerUncheckedCreateInput,
  });
}

export function makeOrder(
  prisma: PrismaClient,
  userId: string,
  id: string,
  overrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
) {
  return prisma.order.create({
    data: {
      id,
      userId,
      items: [],
      shippingAddress: ADDRESS,
      paymentMethod: 'cash',
      subtotal: 10,
      deliveryFee: 0,
      tax: 0,
      total: 10,
      status: 'Placed',
      statusHistory: [],
      ...overrides,
    } as Prisma.OrderUncheckedCreateInput,
  });
}
