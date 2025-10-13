'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Building2, Layers, Users, DollarSign, Globe, Shield, Activity, Settings } from 'lucide-react'
import { CONTRACT_ADDRESSES as SHARED_CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../config/contracts'

// Use shared contract addresses from config
const CONTRACT_ADDRESSES = {
  EnvironmentConfig: SHARED_CONTRACT_ADDRESSES.EnvironmentConfig,
  HubEndpoint: SHARED_CONTRACT_ADDRESSES.HubEndpoint,
  SpokeEndpoint: SHARED_CONTRACT_ADDRESSES.SpokeEndpoint,
  MockUSDCHub: SHARED_CONTRACT_ADDRESSES.MockUSDCHub,
  MockUSDCSpoke: SHARED_CONTRACT_ADDRESSES.MockUSDCSpoke,
  USDCOFTAdapterHub: SHARED_CONTRACT_ADDRESSES.USDCOFTAdapterHub,
  USDCOFTAdapterSpoke: SHARED_CONTRACT_ADDRESSES.USDCOFTAdapterSpoke,
  OFTUSDC: SHARED_CONTRACT_ADDRESSES.OFTUSDC,
  VaultFactory: SHARED_CONTRACT_ADDRESSES.VaultFactory,
  PropertyDAOFactory: SHARED_CONTRACT_ADDRESSES.PropertyDAOFactory,
  PropertyRegistry: SHARED_CONTRACT_ADDRESSES.PropertyRegistry,
  PropertyVault: SHARED_CONTRACT_ADDRESSES.PropertyVault,
  PropertyDAO: SHARED_CONTRACT_ADDRESSES.PropertyDAO,
  StacksCrossChainManager: SHARED_CONTRACT_ADDRESSES.StacksCrossChainManager,
}

// Simple ABI for checking contract existence
const SIMPLE_ABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const

interface ContractStatus {
  name: string
  address: string
  icon: React.ReactNode
  category: string
  chain: 'Hub (Sepolia)' | 'Spoke (BNB Testnet)' | 'Both'
  isDeployed: boolean
  owner?: string
}

export function ContractStatus() {
  const { address, isConnected } = useAccount()
  const [contracts, setContracts] = useState<ContractStatus[]>([])
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Contract definitions with icons, categories, and chain info
  // Filter out contracts without addresses (not deployed on this network)
  const contractDefinitions = [
    {
      name: 'EnvironmentConfig',
      address: CONTRACT_ADDRESSES.EnvironmentConfig,
      icon: <Settings className="h-5 w-5" />,
      category: 'Infrastructure',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'Hub Endpoint',
      address: CONTRACT_ADDRESSES.HubEndpoint,
      icon: <Layers className="h-5 w-5" />,
      category: 'Infrastructure',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'Spoke Endpoint',
      address: CONTRACT_ADDRESSES.SpokeEndpoint,
      icon: <Layers className="h-5 w-5" />,
      category: 'Infrastructure',
      chain: 'Spoke (BNB Testnet)' as const
    },
    {
      name: 'MockUSDC',
      address: CONTRACT_ADDRESSES.MockUSDCHub,
      icon: <DollarSign className="h-5 w-5" />,
      category: 'Token Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'MockUSDC',
      address: CONTRACT_ADDRESSES.MockUSDCSpoke,
      icon: <DollarSign className="h-5 w-5" />,
      category: 'Token Layer',
      chain: 'Spoke (BNB Testnet)' as const
    },
    {
      name: 'USDCOFTAdapter',
      address: CONTRACT_ADDRESSES.USDCOFTAdapterHub,
      icon: <Layers className="h-5 w-5" />,
      category: 'Token Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'USDCOFTAdapter',
      address: CONTRACT_ADDRESSES.USDCOFTAdapterSpoke,
      icon: <Layers className="h-5 w-5" />,
      category: 'Token Layer',
      chain: 'Spoke (BNB Testnet)' as const
    },
    {
      name: 'OFTUSDC',
      address: CONTRACT_ADDRESSES.OFTUSDC,
      icon: <DollarSign className="h-5 w-5" />,
      category: 'Token Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'VaultFactory',
      address: CONTRACT_ADDRESSES.VaultFactory,
      icon: <Building2 className="h-5 w-5" />,
      category: 'Property Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'PropertyDAOFactory',
      address: CONTRACT_ADDRESSES.PropertyDAOFactory,
      icon: <Users className="h-5 w-5" />,
      category: 'Property Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'PropertyRegistry',
      address: CONTRACT_ADDRESSES.PropertyRegistry,
      icon: <Building2 className="h-5 w-5" />,
      category: 'Property Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'PropertyVault',
      address: CONTRACT_ADDRESSES.PropertyVault,
      icon: <Building2 className="h-5 w-5" />,
      category: 'Property Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'PropertyDAO',
      address: CONTRACT_ADDRESSES.PropertyDAO,
      icon: <Users className="h-5 w-5" />,
      category: 'Property Layer',
      chain: 'Hub (Sepolia)' as const
    },
    {
      name: 'StacksCrossChainManager',
      address: CONTRACT_ADDRESSES.StacksCrossChainManager,
      icon: <Globe className="h-5 w-5" />,
      category: 'Cross-Chain Layer',
      chain: 'Hub (Sepolia)' as const
    }
  ].filter(contract => contract.address && contract.address.length > 0)

  // Check contract deployment status
  useEffect(() => {
    const checkContracts = async () => {
      setIsLoading(true)
      const contractStatuses: ContractStatus[] = []
      
      for (const contract of contractDefinitions) {
        try {
          // Determine which RPC to use based on chain
          const rpcUrl = contract.chain.includes('Spoke') 
            ? NETWORK_CONFIG.spokeRpcUrl 
            : NETWORK_CONFIG.rpcUrl
          
          // Check if code exists at the address
          const codeResult = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getCode',
              params: [contract.address, 'latest'],
              id: 1
            })
          })
          
          const codeResponse = await codeResult.json()
          // Contract is deployed if there's code at the address (more than just "0x")
          const isDeployed = !codeResponse.error && codeResponse.result && codeResponse.result !== '0x'
          
          // Try to get owner if contract is deployed (but don't fail if it doesn't have owner())
          let owner: string | undefined
          if (isDeployed) {
            try {
              const ownerResult = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'eth_call',
                  params: [
                    {
                      to: contract.address,
                      data: '0x8da5cb5b' // owner() function selector
                    },
                    'latest'
                  ],
                  id: 2
                })
              })
              
              const ownerResponse = await ownerResult.json()
              if (!ownerResponse.error && ownerResponse.result && ownerResponse.result !== '0x') {
                owner = '0x' + ownerResponse.result.slice(-40)
              }
            } catch {
              // Ignore if owner() doesn't exist
            }
          }
          
          contractStatuses.push({
            ...contract,
            isDeployed,
            owner
          })
        } catch (error) {
          contractStatuses.push({
            ...contract,
            isDeployed: false
          })
        }
      }
      
      setContracts(contractStatuses)
      setIsLoading(false)
    }

    if (isConnected) {
      checkContracts()
    }
  }, [isConnected])

  // Group contracts by category
  const contractsByCategory = contracts.reduce((acc, contract) => {
    if (!acc[contract.category]) {
      acc[contract.category] = []
    }
    acc[contract.category].push(contract)
    return acc
  }, {} as Record<string, ContractStatus[]>)

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Activity className="mr-2 h-5 w-5" />
          Contract Status
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
          Contract Status
        </h2>
        <p className="text-muted-foreground">Connect your wallet to view contract status</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Activity className="mr-2 h-5 w-5" />
          Contract Status
        </h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Checking contract deployment status...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Activity className="mr-2 h-5 w-5" />
        Contract Status
      </h2>
      
      <div className="space-y-6">
        {Object.entries(contractsByCategory).map(([category, categoryContracts]) => (
          <div key={category}>
            <h3 className="text-lg font-medium mb-3 text-muted-foreground">{category}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categoryContracts.map((contract) => (
                <div
                  key={`${contract.name}-${contract.chain}-${contract.address}`}
                  className={`border rounded-lg p-4 ${
                    contract.isDeployed 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={contract.isDeployed ? 'text-green-600' : 'text-red-600'}>
                        {contract.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{contract.name}</span>
                        <span className={`text-xs font-medium ${
                          contract.chain.includes('Hub') 
                            ? 'text-blue-600' 
                            : 'text-orange-600'
                        }`}>
                          {contract.chain}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      contract.isDeployed 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {contract.isDeployed ? 'Deployed' : 'Not Found'}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground break-all">
                      {contract.address}
                    </p>
                    {contract.owner && (
                      <p className="text-xs text-muted-foreground">
                        Owner: {contract.owner.slice(0, 6)}...{contract.owner.slice(-4)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 pt-4 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Total Contracts: {contracts.length}
          </span>
          <span className="text-muted-foreground">
            Deployed: {contracts.filter(c => c.isDeployed).length}
          </span>
        </div>
      </div>
    </div>
  )
}
