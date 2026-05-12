/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb', // untuk upload audio multipart
    },
  },
};

module.exports = nextConfig;
