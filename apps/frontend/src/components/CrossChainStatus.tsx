'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Link, ArrowRightLeft, Layers, Globe } from 'lucide-react'

const STACKS_MANAGER_ABI = [
  {
    "inputs": [],
    "name": "getCrossChainStatus",
    "outputs": [
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "totalDeposits",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalWithdrawals",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const

const SHARE_OFT_ABI = [
  {
    "inputs": [],
    "name": "getPeer",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const

interface CrossChainStatus {
  stacksActive: boolean
  totalDeposits: string
  totalWithdrawals: string
  layerZeroPeer: string
}

export function CrossChainStatus() {
  const { address, isConnected } = useAccount()
  const [status, setStatus] = useState<CrossChainStatus | null>(null)
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const stacksManagerAddress = process.env.NEXT_PUBLIC_STACKS_MANAGER_ADDRESS as `0x${string}`
  const shareOFTAddress = process.env.NEXT_PUBLIC_SHARE_OFT_ADDRESS as `0x${string}`

  const { data: crossChainStatus } = useReadContract({
    address: stacksManagerAddress,
    abi: STACKS_MANAGER_ABI,
    functionName: 'getCrossChainStatus',
    query: {
      enabled: !!stacksManagerAddress && isConnected && mounted,
    },
  })

  const { data: layerZeroPeer } = useReadContract({
    address: shareOFTAddress,
    abi: SHARE_OFT_ABI,
    functionName: 'getPeer',
    query: {
      enabled: !!shareOFTAddress && isConnected && mounted,
    },
  })

  useEffect(() => {
    // Mock data for demonstration
    setStatus({
      stacksActive: true,
      totalDeposits: '500000',
      totalWithdrawals: '100000',
      layerZeroPeer: '0x' + '0'.repeat(40), // Mock peer address
    })
  }, [crossChainStatus, layerZeroPeer])

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Globe className="mr-2 h-5 w-5" />
          Cross-Chain Status
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
          <Globe className="mr-2 h-5 w-5" />
          Cross-Chain Status
        </h2>
        <p className="text-muted-foreground">Connect your wallet to view cross-chain status</p>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Globe className="mr-2 h-5 w-5" />
          Cross-Chain Status
        </h2>
        <p className="text-muted-foreground">Loading cross-chain status...</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Globe className="mr-2 h-5 w-5" />
        Cross-Chain Status
      </h2>
      
      <div className="space-y-4">
        {/* Stacks Integration */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <Layers className="mr-2 h-5 w-5 text-orange-500" />
              <h3 className="font-semibold">Stacks Integration</h3>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs ${
              status.stacksActive 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {status.stacksActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total sBTC Deposits</p>
              <p className="font-semibold">{(Number(status.totalDeposits) / 1e18).toFixed(4)} sBTC</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Withdrawals</p>
              <p className="font-semibold">{(Number(status.totalWithdrawals) / 1e18).toFixed(4)} sBTC</p>
            </div>
          </div>
        </div>

        {/* LayerZero Integration */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <ArrowRightLeft className="mr-2 h-5 w-5 text-blue-500" />
              <h3 className="font-semibold">LayerZero OVault</h3>
            </div>
            <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
              Ready
            </span>
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground mb-2">Connected to LayerZero</p>
            <div className="flex items-center space-x-2">
              <Link className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-mono">
                {status.layerZeroPeer.slice(0, 6)}...{status.layerZeroPeer.slice(-4)}
              </span>
            </div>
          </div>
        </div>

        {/* Cross-Chain Actions */}
        <div className="space-y-2">
          <button className="w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between">
            <span className="flex items-center">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer Shares Cross-Chain
            </span>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          
          <button className="w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between">
            <span className="flex items-center">
              <Layers className="mr-2 h-4 w-4" />
              Deposit sBTC from Stacks
            </span>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          
          <button className="w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between">
            <span className="flex items-center">
              <Globe className="mr-2 h-4 w-4" />
              View Cross-Chain History
            </span>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
