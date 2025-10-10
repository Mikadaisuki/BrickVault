'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Building2, Layers, Users, DollarSign, Globe, Shield, Activity, Settings } from 'lucide-react'

// Contract addresses from initial deployment
const CONTRACT_ADDRESSES = {
  EnvironmentConfig: process.env.NEXT_PUBLIC_ENVIRONMENT_CONFIG_ADDRESS || '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  MockLayerZeroEndpointA: process.env.NEXT_PUBLIC_MOCK_ENDPOINT_A_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  MockLayerZeroEndpointB: process.env.NEXT_PUBLIC_MOCK_ENDPOINT_B_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  MockUSDC: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS || '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  ShareOFTAdapter: process.env.NEXT_PUBLIC_SHARE_OFT_ADAPTER_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
  OFTUSDC: process.env.NEXT_PUBLIC_OFT_USDC_ADDRESS || '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  VaultFactory: process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS || '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  PropertyDAOFactory: process.env.NEXT_PUBLIC_PROPERTY_DAO_FACTORY_ADDRESS || '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  PropertyRegistry: process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS || '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  PropertyVault: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS || '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
  PropertyDAO: process.env.NEXT_PUBLIC_PROPERTY_DAO_ADDRESS || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
  StacksCrossChainManager: process.env.NEXT_PUBLIC_STACKS_MANAGER_ADDRESS || '0x610178dA211FEF7D417bC0e6FeD39F05609AD788',
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
  isDeployed: boolean
  owner?: string
}

export function ContractStatus() {
  const { address, isConnected } = useAccount()
  const [contracts, setContracts] = useState<ContractStatus[]>([])
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Contract definitions with icons and categories
  const contractDefinitions = [
    {
      name: 'EnvironmentConfig',
      address: CONTRACT_ADDRESSES.EnvironmentConfig,
      icon: <Settings className="h-5 w-5" />,
      category: 'Infrastructure'
    },
    {
      name: 'MockLayerZeroEndpointA',
      address: CONTRACT_ADDRESSES.MockLayerZeroEndpointA,
      icon: <Layers className="h-5 w-5" />,
      category: 'Infrastructure'
    },
    {
      name: 'MockLayerZeroEndpointB',
      address: CONTRACT_ADDRESSES.MockLayerZeroEndpointB,
      icon: <Layers className="h-5 w-5" />,
      category: 'Infrastructure'
    },
    {
      name: 'MockUSDC',
      address: CONTRACT_ADDRESSES.MockUSDC,
      icon: <DollarSign className="h-5 w-5" />,
      category: 'Token Layer'
    },
    {
      name: 'ShareOFTAdapter',
      address: CONTRACT_ADDRESSES.ShareOFTAdapter,
      icon: <Layers className="h-5 w-5" />,
      category: 'Token Layer'
    },
    {
      name: 'OFTUSDC',
      address: CONTRACT_ADDRESSES.OFTUSDC,
      icon: <DollarSign className="h-5 w-5" />,
      category: 'Token Layer'
    },
    {
      name: 'VaultFactory',
      address: CONTRACT_ADDRESSES.VaultFactory,
      icon: <Building2 className="h-5 w-5" />,
      category: 'Property Layer'
    },
    {
      name: 'PropertyDAOFactory',
      address: CONTRACT_ADDRESSES.PropertyDAOFactory,
      icon: <Users className="h-5 w-5" />,
      category: 'Property Layer'
    },
    {
      name: 'PropertyRegistry',
      address: CONTRACT_ADDRESSES.PropertyRegistry,
      icon: <Building2 className="h-5 w-5" />,
      category: 'Property Layer'
    },
    {
      name: 'PropertyVault',
      address: CONTRACT_ADDRESSES.PropertyVault,
      icon: <Building2 className="h-5 w-5" />,
      category: 'Property Layer'
    },
    {
      name: 'PropertyDAO',
      address: CONTRACT_ADDRESSES.PropertyDAO,
      icon: <Users className="h-5 w-5" />,
      category: 'Property Layer'
    },
    {
      name: 'StacksCrossChainManager',
      address: CONTRACT_ADDRESSES.StacksCrossChainManager,
      icon: <Globe className="h-5 w-5" />,
      category: 'Cross-Chain Layer'
    }
  ]

  // Check contract deployment status
  useEffect(() => {
    const checkContracts = async () => {
      const contractStatuses: ContractStatus[] = []
      
      for (const contract of contractDefinitions) {
        try {
          // Check if code exists at the address
          const codeResult = await fetch('http://localhost:8545', {
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
              const ownerResult = await fetch('http://localhost:8545', {
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
                  key={contract.name}
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
                      <span className="font-medium text-sm">{contract.name}</span>
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
                    <p className="text-xs text-muted-foreground">
                      Address: {contract.address}
                    </p>
                    {contract.owner && (
                      <p className="text-xs text-muted-foreground">
                        Owner: {contract.owner}
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
