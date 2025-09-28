'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react'

const PROPERTY_VAULT_ABI = [
  {
    "inputs": [],
    "name": "getPropertyInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "propertyId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isPurchased",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "totalRentHarvested",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalNavChanges",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAssets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const

interface VaultMetrics {
  totalAssets: string
  totalSupply: string
  totalRentHarvested: string
  totalNavChanges: string
  isPurchased: boolean
}

export function VaultMetrics() {
  const { address, isConnected } = useAccount()
  const [metrics, setMetrics] = useState<VaultMetrics | null>(null)
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const propertyVaultAddress = process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`

  const { data: propertyInfo } = useReadContract({
    address: propertyVaultAddress,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'getPropertyInfo',
    query: {
      enabled: !!propertyVaultAddress && isConnected && mounted,
    },
  })

  const { data: totalAssets } = useReadContract({
    address: propertyVaultAddress,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'totalAssets',
    query: {
      enabled: !!propertyVaultAddress && isConnected && mounted,
    },
  })

  const { data: totalSupply } = useReadContract({
    address: propertyVaultAddress,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'totalSupply',
    query: {
      enabled: !!propertyVaultAddress && isConnected && mounted,
    },
  })

  useEffect(() => {
    if (propertyInfo && totalAssets !== undefined && totalSupply !== undefined) {
      setMetrics({
        totalAssets: (Number(totalAssets) / 1e18).toFixed(2),
        totalSupply: (Number(totalSupply) / 1e18).toFixed(2),
        totalRentHarvested: (Number(propertyInfo[2]) / 1e18).toFixed(2),
        totalNavChanges: (Number(propertyInfo[3]) / 1e18).toFixed(2),
        isPurchased: propertyInfo[1],
      })
    }
  }, [propertyInfo, totalAssets, totalSupply])

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Activity className="mr-2 h-5 w-5" />
          Vault Metrics
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Activity className="mr-2 h-5 w-5" />
          Vault Metrics
        </h2>
        <p className="text-muted-foreground">Connect your wallet to view vault metrics</p>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Activity className="mr-2 h-5 w-5" />
          Vault Metrics
        </h2>
        <p className="text-muted-foreground">Loading metrics...</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Activity className="mr-2 h-5 w-5" />
        Vault Metrics
      </h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Assets</p>
              <p className="text-2xl font-bold">{metrics.totalAssets} USDC</p>
            </div>
            <DollarSign className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Supply</p>
              <p className="text-2xl font-bold">{metrics.totalSupply} Shares</p>
            </div>
            <Activity className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Rent Harvested</p>
              <p className="text-2xl font-bold flex items-center">
                <TrendingUp className="mr-1 h-4 w-4 text-green-500" />
                {metrics.totalRentHarvested} USDC
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">NAV Changes</p>
              <p className="text-2xl font-bold flex items-center">
                {Number(metrics.totalNavChanges) >= 0 ? (
                  <TrendingUp className="mr-1 h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="mr-1 h-4 w-4 text-red-500" />
                )}
                {metrics.totalNavChanges} USDC
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Property Status</span>
          <span className={`px-2 py-1 rounded-full text-xs ${
            metrics.isPurchased 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {metrics.isPurchased ? 'Purchased' : 'Available'}
          </span>
        </div>
      </div>
    </div>
  )
}
