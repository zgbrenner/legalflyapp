/** @type {import('next').NextConfig} */
const path = require("node:path");

const transformersWeb = path.join(
  path.dirname(require.resolve("@huggingface/transformers")),
  "transformers.web.js",
);

const binaryHeaders = [
  { key: "Accept-Ranges", value: "bytes" },
  { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
  { key: "Content-Type", value: "application/octet-stream" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["three", "@huggingface/transformers"],
  webpack(config) {
    // A module worker always needs the browser export. Next also analyzes client
    // modules in its server compilation, whose default package condition would
    // otherwise pull in Transformers.js' Node-only Sharp dependency.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@huggingface/transformers$": transformersWeb,
    };
    return config;
  },
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
