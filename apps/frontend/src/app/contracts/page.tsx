'use client'

import dynamic from 'next/dynamic'
import { Header } from '@/components/Header'

// Dynamically import components that use wagmi hooks with SSR disabled
const ContractStatus = dynamic(() => import('@/components/ContractStatus').then(mod => ({ default: mod.ContractStatus })), { ssr: false })
const CrossChainStatus = dynamic(() => import('@/components/CrossChainStatus').then(mod => ({ default: mod.CrossChainStatus })), { ssr: false })

export default function ContractsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Contracts
          </h1>
          <p className="text-muted-foreground">
            Monitor contract status and cross-chain operations
          </p>
        </div>

        <div className="space-y-8">
          <ContractStatus />
          <CrossChainStatus />
        </div>
      </main>
    </div>
  )
}
