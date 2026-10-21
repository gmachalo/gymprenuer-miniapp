import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets other devices on the LAN (e.g. a phone testing the game)
  // reach the dev server's hot-reload and other dev resources. No effect in
  // production builds.
  allowedDevOrigins: ["10.17.1.42"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  experimental: {
    authInterrupts: false,
  },
};

export default nextConfig;
