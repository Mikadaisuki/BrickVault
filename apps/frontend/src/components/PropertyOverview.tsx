'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { Building2, MapPin, DollarSign, Users } from 'lucide-react'
import { 
  PROPERTY_REGISTRY_ABI, 
  PROPERTY_VAULT_ABI 
} from '@brickvault/abi'

interface PropertyInfo {
  id: string
  name: string
  depositCap: string
  vaultAddress: string
  isPurchased: boolean
  totalAssets: string
  totalSupply: string
  assetsPerShare: string
  status: string
}

// Helper function to convert property status enum to readable text
function getPropertyStatusText(status: number): string {
  switch (status) {
    case 0: return 'Draft'
    case 1: return 'Active'
    case 2: return 'Paused'
    case 3: return 'Sold'
    case 4: return 'Cancelled'
    default: return 'Unknown'
  }
}

export function PropertyOverview() {
  const [mounted, setMounted] = useState(false)
  const [properties, setProperties] = useState<PropertyInfo[]>([])
  const [loading, setLoading] = useState(false)
  
  // Use wagmi hooks but only when mounted
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Use the PropertyRegistry address (base registry where properties are created)
  const registryAddress = process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as `0x${string}`

  // Get property count (from base PropertyRegistry where properties are created)
  const { data: propertyCount, error: countError, isLoading: countLoading, isError: countIsError } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getPropertyCount',
    query: {
      enabled: !!registryAddress && isConnected && mounted && chainId === 31337,
    },
  })

  // Get property details for property ID 1 (from deployment script)
  const { data: property1, error: propertyError, isLoading: propertyLoading, isError: propertyIsError } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getProperty',
    args: [1],
    query: {
      enabled: !!registryAddress && isConnected && mounted && chainId === 31337,
    },
  })

  // Get vault data for the deployed property
  const { data: totalAssets } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'totalAssets',
    query: {
      enabled: !!process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS && isConnected && mounted && chainId === 31337,
    },
  })

  const { data: totalSupply } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'totalSupply',
    query: {
      enabled: !!process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS && isConnected && mounted && chainId === 31337,
    },
  })

  const { data: assetsPerShare } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'getAssetsPerShare',
    query: {
      enabled: !!process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS && isConnected && mounted && chainId === 31337,
    },
  })

  // Get the property name from the vault (ERC20 name)
  const { data: propertyName } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'name',
    query: {
      enabled: !!process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS && isConnected && mounted && chainId === 31337,
    },
  })

  useEffect(() => {
    
    // Auto-switch to localhost if on wrong network
    if (mounted && isConnected && chainId !== 31337) {
      try {
        switchChain({ chainId: 31337 })
      } catch (error) {
        console.error('Failed to switch chain:', error)
      }
    }
    
    
    // Create property info from actual contract data
    if (mounted && propertyCount && propertyCount > 0 && property1) {
      setLoading(true)
      
      
      // Create property info from the actual contract data
      const propertyInfo: PropertyInfo = {
        id: '1',
        name: propertyName as string || `Property #${property1.vault ? '1' : 'Unknown'}`,
        depositCap: property1.depositCap ? (Number(property1.depositCap) / 1e18).toFixed(0) : '0',
        vaultAddress: property1.vault || process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS || '',
        isPurchased: property1.totalDeposited > 0, // Property is purchased if there are deposits
        totalAssets: totalAssets ? (Number(totalAssets) / 1e18).toFixed(2) : '0',
        totalSupply: totalSupply ? (Number(totalSupply) / 1e18).toFixed(2) : '0',
        assetsPerShare: assetsPerShare ? (Number(assetsPerShare) / 1e18).toFixed(6) : '0',
        status: getPropertyStatusText(Number(property1.status))
      }
      
      setProperties([propertyInfo])
      setLoading(false)
    } else if (mounted && propertyCount === 0) {
      // No properties exist yet
      setProperties([])
      setLoading(false)
    }
  }, [mounted, propertyCount, property1, totalAssets, totalSupply, assetsPerShare, propertyName, isConnected, registryAddress])

  if (!mounted) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Building2 className="mr-2 h-5 w-5" />
          Properties
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
          <Building2 className="mr-2 h-5 w-5" />
          Properties
        </h2>
        <p className="text-muted-foreground">Connect your wallet to view properties</p>
      </div>
    )
  }

  // Show network warning if on wrong chain
  if (mounted && isConnected && chainId !== 31337) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Building2 className="mr-2 h-5 w-5" />
          Properties
        </h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Building2 className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Wrong Network
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>Please switch to <strong>Localhost (Chain ID: 31337)</strong> to view property data.</p>
                <p className="mt-1">Current network: Chain ID {chainId}</p>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => switchChain({ chainId: 31337 })}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm"
                >
                  Switch to Localhost
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Building2 className="mr-2 h-5 w-5" />
        Properties
      </h2>
      
      <div className="mb-4 text-sm text-muted-foreground">
        {propertyCount !== undefined ? (
          <>Total Properties: {propertyCount.toString()}</>
        ) : (
          <>Total Properties: Loading...</>
        )}
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center py-8">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No properties found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Properties will appear here once they are created and funded
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {properties.map((property) => (
            <div key={property.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{property.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center">
                    <MapPin className="mr-1 h-3 w-3" />
                    Property ID: {property.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vault: {property.vaultAddress.slice(0, 6)}...{property.vaultAddress.slice(-4)}
                  </p>
                  {property.isPurchased && (
                    <p className="text-xs text-green-600 font-medium">
                      💰 Total Deposited: {(Number(property1?.totalDeposited || 0) / 1e18).toFixed(2)} OFTUSDC
                    </p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  property.isPurchased 
                    ? 'bg-green-100 text-green-800' 
                    : property.status === 'Active'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {property.isPurchased ? 'Purchased' : property.status}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center">
                  <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Assets</p>
                    <p className="font-semibold">{property.totalAssets} OFTUSDC</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Supply</p>
                    <p className="font-semibold">{property.totalSupply} shares</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Assets per Share</p>
                    <p className="font-semibold">{property.assetsPerShare} OFTUSDC</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Deposit Cap</p>
                    <p className="font-semibold">{property.depositCap} OFTUSDC</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}