'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { useState } from 'react'

// Local chain configuration
const localhost = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://localhost:8545'],
    },
  },
  testnet: true,
}

const config = createConfig({
  chains: [localhost, mainnet, sepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [localhost.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
