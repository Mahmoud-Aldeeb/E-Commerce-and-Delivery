import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { siteConfig } from "@/config/site";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex shrink-0 items-center gap-2 ${className}`}
      aria-label={`${siteConfig.name} home`}
    >
      <span className="flex size-8 items-center justify-center rounded-control bg-primary-700 text-white">
        <ShoppingBagIcon className="size-4" />
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">{siteConfig.name}</span>
    </Link>
  );
}