/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  swcMinify: true,
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }],
    // Required so the brand logo can be served through next/image as SVG.
    // Safe here: these are our own files in public/brand, not user uploads.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
  },
  async rewrites() {
    // Proxy to the backend so the browser never needs CORS in dev
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    return [
      { source: "/api/backend/:path*", destination: `${api}/:path*` },
    ];
  },
};

export default nextConfig;
