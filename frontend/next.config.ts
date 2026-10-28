import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      // Product images uploaded through the API
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Placeholder images used by the seed data
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
};

export default nextConfig;

// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {
//   images: {
//     remotePatterns: [
//       // Product images uploaded through the API
//       { protocol: "https", hostname: "res.cloudinary.com" },
//       // Placeholder images used by the seed data
//       { protocol: "https", hostname: "placehold.co" },
//     ],
//   },
// };

// export default nextConfig;
