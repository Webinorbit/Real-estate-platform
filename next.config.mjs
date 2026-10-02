const extraImageHosts = [process.env.S3_PUBLIC_URL, ...(process.env.IMAGE_HOSTS || "").split(",")]
  .map((v) => (v || "").trim())
  .filter(Boolean)
  .map((v) => {
    try {
      const u = new URL(v.includes("://") ? v : `https://${v}`);
      return { protocol: u.protocol.replace(":", ""), hostname: u.hostname, ...(u.port ? { port: u.port } : {}) };
    } catch {
      return null;
    }
  })
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: import.meta.dirname },
  allowedDevOrigins: ["*.localhost", "localhost", "127.0.0.1"],
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      ...extraImageHosts,
    ],
  },
  async rewrites() {
    const api = (process.env.API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    return [{ source: "/uploads/:path*", destination: `${api}/uploads/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), gyroscope=(self), accelerometer=(self), camera=()" },
        ],
      },
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:dir(demo|vendor)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
