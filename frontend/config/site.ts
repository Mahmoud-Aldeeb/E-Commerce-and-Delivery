import {
  ArmchairIcon,
  BadgeCheckIcon,
  ClockIcon,
  DumbbellIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  PuzzleIcon,
  ShieldCheckIcon,
  ShirtIcon,
  SmartphoneIcon,
  SparklesIcon,
  TruckIcon,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiX } from "@icons-pack/react-simple-icons";

// Change the brand in ONE place
// Change the brand in ONE place
export const siteConfig = {
  name: "Cartly",
  tagline: "Everything you need, delivered to your door",
  // Must match the API rule: orders above this subtotal get free delivery
  freeDeliveryThreshold: 20,
  // Public address of the web app (with https://). Used by the sitemap, robots.txt and link previews
  siteUrl: (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, ""),
};

// The real details of the store: ONE place, used by the footer and by the info pages
export const storeInfo = {
  email: "mahmoudalden125@gmail.com",
  phone: "+20 111 619 9664",
  phoneHref: "tel:+201116199664",
  address: "Tanta, Egypt",
  replyHours: "8:00 AM to 8:00 PM (Egypt time)",
  deliveryCities: ["Cairo", "Tanta", "Alexandria"],
  deliveryHours: 72,
  returnDays: 14,
  // Change it every time the policies change
  legalUpdatedAt: "October 31, 2026",
};

// The size chart of the store, in centimetres: ONE chart for every product.
// These numbers are SAMPLES: replace them with the real measurements of your clothes
export const sizeGuide = {
  note: "Body measurements in centimetres. Between two sizes? Take the bigger one.",
  columns: ["Chest", "Waist", "Hips"],
  rows: [
    { size: "XS", values: ["82-87", "66-71", "88-93"] },
    { size: "S", values: ["88-93", "72-77", "94-99"] },
    { size: "M", values: ["94-99", "78-83", "100-105"] },
    { size: "L", values: ["100-105", "84-89", "106-111"] },
    { size: "XL", values: ["106-113", "90-97", "112-118"] },
    { size: "XXL", values: ["114-121", "98-105", "119-125"] },
  ],
};

// The slugs must match the `category` values stored on the products
export const categoriesData = [
  { slug: "electronics", name: "Electronics", icon: SmartphoneIcon },
  { slug: "fashion", name: "Fashion", icon: ShirtIcon },
  { slug: "home-kitchen", name: "Home & Kitchen", icon: ArmchairIcon },
  { slug: "beauty-health", name: "Beauty & Health", icon: SparklesIcon },
  { slug: "sports-outdoors", name: "Sports & Outdoors", icon: DumbbellIcon },
  { slug: "toys-games", name: "Toys & Games", icon: PuzzleIcon },
];

export const heroSectionData = {
  eyebrow: `Free delivery on orders over $${siteConfig.freeDeliveryThreshold}`,
  title: siteConfig.tagline,
  description:
    "Shop electronics, fashion, home essentials and more. Follow every order live on the map and pay the way you prefer.",
  primaryCta: { label: "Shop now", href: "/products" },
  secondaryCta: { label: "See today's deals", href: "/deals" },
  // Only things the store really does
  features: [
    {
      icon: TruckIcon,
      title: "Free delivery",
      desc: `On orders over $${siteConfig.freeDeliveryThreshold}`,
    },
    {
      icon: MapPinIcon,
      title: "Live tracking",
      desc: "Follow your order on the map",
    },
    {
      icon: ShieldCheckIcon,
      title: "Secure checkout",
      desc: "Pay by card or on delivery",
    },
    {
      icon: BadgeCheckIcon,
      title: "Verified delivery",
      desc: "Confirmed with a one-time code",
    },
  ],
};

export const footerData = {
  brand: {
    name: siteConfig.name,
    description:
      "Quality products from trusted sellers, delivered fast and tracked live from checkout to your door.",
    // Put the real address of each account in `link`. An entry with an empty link is not shown
    socials: [
      { icon: SiFacebook, link: "", label: "Facebook" },
      { icon: SiX, link: "", label: "X" },
      { icon: SiInstagram, link: "", label: "Instagram" },
    ],
  },

  sections: [
    {
      title: "Shop",
      links: [
        { label: "All products", href: "/products" },
        { label: "Flash deals", href: "/deals" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "My account", href: "/account" },
        { label: "My orders", href: "/orders" },
        { label: "Favorites", href: "/favorites" },
        { label: "Addresses", href: "/addresses" },
      ],
    },
    {
      title: "Help",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Contact us", href: "/contact" },
      ],
    },
  ],

  contact: [
    { icon: MapPinIcon, text: storeInfo.address },
    { icon: PhoneIcon, text: storeInfo.phone, href: storeInfo.phoneHref },
    {
      icon: MailIcon,
      text: storeInfo.email,
      href: `mailto:${storeInfo.email}`,
    },
    { icon: ClockIcon, text: `Replies ${storeInfo.replyHours}` },
  ],

  bottom: {
    copyright: `© 2026 ${siteConfig.name}. A portfolio project by Mahmoud Aldeeb.`,
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
};

// Status badges: color only where it carries meaning
// (in progress = brand color, delivered = green, cancelled = red)
export const statusColors: Record<string, string> = {
  Placed: "bg-gray-100 text-gray-700",
  Confirmed: "bg-gray-100 text-gray-700",
  Assigned: "bg-primary-50 text-primary-800",
  Packed: "bg-primary-50 text-primary-800",
  "Out for Delivery": "bg-primary-100 text-primary-800",
  Delivered: "bg-success-soft text-green-700",
  Cancelled: "bg-danger-soft text-red-700",
};
