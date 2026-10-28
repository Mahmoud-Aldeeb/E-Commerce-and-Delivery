import type { Prisma } from '../generated/prisma/client.js';

type CatalogItem = {
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  stock?: number; // optional override, to test low-stock and out-of-stock states
};

// color = background of the placeholder image of the category (hex without #)
const catalog: Record<string, { color: string; items: CatalogItem[] }> = {
  Electronics: {
    color: '1e40af',
    items: [
      {
        name: 'Wireless Noise-Cancelling Headphones',
        description:
          'Over-ear Bluetooth headphones with active noise cancellation and 30 hours of battery life.',
        price: 89.99,
        originalPrice: 129.99,
      },
      {
        name: 'Smart Fitness Watch',
        description:
          'Tracks heart rate, sleep and workouts, with a water-resistant body and a 7-day battery.',
        price: 59.99,
        originalPrice: 79.99,
      },
      {
        name: 'Portable Bluetooth Speaker',
        description:
          'Compact waterproof speaker with deep bass and 12 hours of playtime.',
        price: 34.99,
        originalPrice: 49.99,
      },
      {
        name: '20000mAh Power Bank',
        description:
          'Fast-charging power bank with two USB-A ports and one USB-C port.',
        price: 27.99,
        originalPrice: 39.99,
        stock: 8,
      },
    ],
  },
  Fashion: {
    color: '7c3aed',
    items: [
      {
        name: 'Classic Denim Jacket',
        description:
          'Timeless medium-wash denim jacket with a comfortable regular fit.',
        price: 54.99,
        originalPrice: 74.99,
      },
      {
        name: 'Everyday Cotton T-Shirt (3-Pack)',
        description: 'Soft breathable cotton tees in three neutral colors.',
        price: 24.99,
        originalPrice: 34.99,
      },
      {
        name: 'Lightweight Running Sneakers',
        description:
          'Breathable mesh sneakers with a cushioned sole for daily runs.',
        price: 69.99,
        originalPrice: 89.99,
      },
      {
        name: 'Leather Crossbody Bag',
        description:
          'Compact genuine leather bag with an adjustable strap and zip closure.',
        price: 44.99,
        originalPrice: 64.99,
        stock: 5,
      },
    ],
  },
  'Home & Kitchen': {
    color: 'b45309',
    items: [
      {
        name: 'Programmable Coffee Maker',
        description:
          '12-cup coffee maker with a timer, a reusable filter and an auto shut-off.',
        price: 49.99,
        originalPrice: 69.99,
      },
      {
        name: 'Non-Stick Cookware Set (10 Pieces)',
        description:
          'Pots and pans with a durable non-stick coating and heat-resistant handles.',
        price: 79.99,
        originalPrice: 119.99,
      },
      {
        name: 'Memory Foam Pillow',
        description:
          'Ergonomic pillow that supports your neck, with a washable cover.',
        price: 29.99,
        originalPrice: 39.99,
      },
      {
        name: 'LED Desk Lamp with USB Port',
        description:
          'Dimmable desk lamp with three color modes and a built-in USB charging port.',
        price: 22.99,
        originalPrice: 29.99,
      },
    ],
  },
  'Beauty & Health': {
    color: 'be185d',
    items: [
      {
        name: 'Vitamin C Brightening Serum 30ml',
        description: 'Lightweight daily serum that helps even out skin tone.',
        price: 18.99,
        originalPrice: 24.99,
      },
      {
        name: 'Electric Toothbrush',
        description:
          'Rechargeable toothbrush with five cleaning modes and a two-minute timer.',
        price: 39.99,
        originalPrice: 59.99,
      },
      {
        name: 'Hydrating Face Moisturizer 50ml',
        description: 'Non-greasy daily moisturizer for all skin types.',
        price: 15.99,
        originalPrice: 21.99,
      },
      {
        name: 'Argan Hair Oil 100ml',
        description: 'Nourishing oil that adds shine and helps tame frizz.',
        price: 12.99,
        originalPrice: 17.99,
      },
    ],
  },
  'Sports & Outdoors': {
    color: '15803d',
    items: [
      {
        name: 'Non-Slip Yoga Mat',
        description:
          'Extra-thick 6mm mat with a grippy surface and a carrying strap.',
        price: 21.99,
        originalPrice: 29.99,
      },
      {
        name: 'Adjustable Dumbbell Pair',
        description: 'Space-saving dumbbells with a quick weight-change dial.',
        price: 89.99,
        originalPrice: 119.99,
      },
      {
        name: 'Insulated Steel Water Bottle 1L',
        description:
          'Keeps drinks cold for 24 hours or hot for 12, with a leak-proof lid.',
        price: 19.99,
        originalPrice: 26.99,
      },
      {
        name: 'Camping Backpack 40L',
        description:
          'Water-resistant hiking backpack with a padded back and a rain cover.',
        price: 49.99,
        originalPrice: 69.99,
        stock: 0,
      },
    ],
  },
  'Toys & Games': {
    color: '0f766e',
    items: [
      {
        name: 'Building Blocks Set (500 Pieces)',
        description:
          'Colorful creative blocks that are compatible with major brands.',
        price: 24.99,
        originalPrice: 34.99,
      },
      {
        name: 'Strategy Board Game',
        description:
          'A two-to-four player game of tactics, perfect for family nights.',
        price: 29.99,
        originalPrice: 39.99,
      },
      {
        name: 'Remote Control Race Car',
        description:
          'Fast rechargeable RC car with a 2.4GHz remote and shock-absorbing tires.',
        price: 32.99,
        originalPrice: 44.99,
      },
      {
        name: '1000-Piece Jigsaw Puzzle',
        description:
          'High-quality scenic puzzle with a poster guide in the box.',
        price: 14.99,
        originalPrice: 19.99,
      },
    ],
  },
};

// The names of the categories, in display order: the seed creates them from here
export const CATEGORY_NAMES = Object.keys(catalog);

// Placeholder image with the product name written on it
const imageFor = (name: string, color: string) =>
  `https://placehold.co/600x600/${color}/ffffff.png?text=${encodeURIComponent(name)}`;

export function buildProducts(): Prisma.ProductCreateManyInput[] {
  let index = 0;

  return Object.entries(catalog).flatMap(([category, { color, items }]) =>
    items.map((item) => {
      const i = index++;
      return {
        name: item.name,
        description: item.description,
        price: item.price,
        originalPrice: item.originalPrice,
        image: imageFor(item.name, color),
        category,
        // Deterministic "random" values so every seed run gives the same data
        stock: item.stock ?? 20 + ((i * 37) % 80),
        rating: 4 + ((i * 7) % 10) / 10,
        reviewCount: 5 + ((i * 13) % 200),
      };
    }),
  );
}
