/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the workspace package so Next.js can resolve .ts sources
  transpilePackages: ['@chord/web'],
};

module.exports = nextConfig;
