/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "node-cron", "undici"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
