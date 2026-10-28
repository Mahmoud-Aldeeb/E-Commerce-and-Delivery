import {
  ArmchairIcon,
  BadgeCheckIcon,
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
    socials: [
      { icon: SiFacebook, link: "#", label: "Facebook" },
      { icon: SiX, link: "#", label: "X" },
      { icon: SiInstagram, link: "#", label: "Instagram" },
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
        { label: "Addresses", href: "/addresses" },
      ],
    },
  ],

  // Placeholders: replace with real details
  contact: [
    { icon: MapPinIcon, text: "123 Market Street, Your City" },
    { icon: PhoneIcon, text: "+1 (111) 123-4567" },
    { icon: MailIcon, text: "hello@example.com" },
  ],

  bottom: {
    copyright: `© 2026 ${siteConfig.name}. A portfolio project by Mahmoud Aldeeb.`,
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
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
