import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getSitemapProductIds } from "@/lib/server/products";

// Public pages that never change their address
const STATIC_PATHS = ["/", "/products", "/deals"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const productIds = await getSitemapProductIds();

  return [
    ...STATIC_PATHS.map((path) => ({ url: `${siteConfig.siteUrl}${path}` })),
    ...productIds.map((id) => ({
      url: `${siteConfig.siteUrl}/products/${encodeURIComponent(id)}`,
    })),
  ];
}
