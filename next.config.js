/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '60mb', // 3 audio × ~15 menit (opus ~64kbps ≈ 7 MB/audio)
    },
  },
};

module.exports = nextConfig;
