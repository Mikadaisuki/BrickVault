/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['localhost'],
  },
  env: {
    NEXT_PUBLIC_LOCAL_CHAIN_ID: '31337',
    NEXT_PUBLIC_LOCAL_RPC_URL: 'http://localhost:8545',
  },
}

module.exports = nextConfig
