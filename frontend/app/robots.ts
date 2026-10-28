import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private areas: nothing there is meant for search results
        disallow: [
          "/admin",
          "/delivery",
          "/checkout",
          "/orders",
          "/addresses",
          "/login",
          "/account",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
  };
}
