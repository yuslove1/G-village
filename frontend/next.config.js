// The API serves uploaded listing/sale photos from its own /uploads path
// (see backend/src/modules/uploads/upload.routes.ts — local disk storage,
// no Cloudinary/S3 account exists). next/image refuses to load a remote
// image whose host isn't explicitly allowlisted, so that host has to be
// derived from the same env var the API client uses rather than hardcoded,
// or this breaks the moment NEXT_PUBLIC_API_URL points anywhere else.
const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      {
        protocol: apiUrl.protocol.replace(":", ""),
        hostname: apiUrl.hostname,
        port: apiUrl.port,
      },
    ],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
      ],
    }];
  },
};
module.exports = nextConfig;
