import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/providers";
import { siteConfig } from "@/config/site";

// Self-hosted by Next at build time: no request to Google when users visit the site
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // Relative addresses in the metadata (link previews, canonical links) start from here
  metadataBase: new URL(siteConfig.siteUrl),
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description:
    "Shop electronics, fashion, home essentials and more, with live order tracking.",
};

export const viewport: Viewport = { themeColor: "#0f766e" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}