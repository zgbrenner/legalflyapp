/** @type {import('next').NextConfig} */
const binaryHeaders = [
  { key: "Accept-Ranges", value: "bytes" },
  { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
  { key: "Content-Type", value: "application/octet-stream" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["three"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      ...["malecns.bin", "malecns-anatomy.bin", "malecns-shuffled.bin"].map((asset) => ({
        source: `/legalfly/${asset}`,
        headers: binaryHeaders,
      })),
    ];
  },
};

module.exports = nextConfig;
