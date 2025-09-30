'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi'
import { Building2, Users, Settings, Plus, Pause, Play, DollarSign, AlertTriangle, Eye, MapPin, Calendar } from 'lucide-react'
import { PROPERTY_REGISTRY_ABI, PROPERTY_VAULT_ABI } from '@brickvault/abi'
import { Header } from '@/components/Header'

interface PropertyData {
  id: number
  vault: string
  depositCap: bigint
  totalDeposited: bigint
  status: number
  paused: boolean
  createdAt: bigint
}

export default function ManagementPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<PropertyData[]>([])

  const registryAddress = process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as `0x${string}`
  const { writeContract } = useWriteContract()

  // Get contract owner
  const { data: owner, isLoading: ownerLoading } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'owner',
    query: {
      enabled: !!registryAddress && isConnected && chainId === 31337,
    },
  })

  // Get property count
  const { data: propertyCount } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getPropertyCount',
    query: {
      enabled: !!registryAddress && isConnected && chainId === 31337,
    },
  })

  // Get first property data for demo
  const { data: property1 } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getProperty',
    args: [1],
    query: {
      enabled: !!registryAddress && isConnected && chainId === 31337 && propertyCount && propertyCount > 0,
    },
  })

  // Fetch all properties using contract calls
  const fetchProperties = async () => {
    if (!propertyCount || propertyCount === 0) {
      setProperties([])
      return
    }

    const fetchedProperties: PropertyData[] = []
    
    // For now, we'll use the existing property1 data if it's for property 1
    // In a real implementation, you'd want to fetch all properties using multiple contract calls
    if (property1) {
      fetchedProperties.push({
        id: 1,
        vault: property1.vault,
        depositCap: property1.depositCap,
        totalDeposited: property1.totalDeposited,
        status: Number(property1.status),
        paused: property1.paused,
        createdAt: property1.createdAt
      })
    }

    setProperties(fetchedProperties)
  }

  // Check if current user is owner and handle network switching
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-switch to localhost if on wrong network
  useEffect(() => {
    if (mounted && isConnected && chainId !== 31337) {
      try {
        switchChain({ chainId: 31337 })
      } catch (error) {
        console.error('Failed to switch chain:', error)
      }
    }
  }, [mounted, isConnected, chainId, switchChain])

  useEffect(() => {
    if (mounted && owner && address) {
      setIsOwner(address.toLowerCase() === owner.toLowerCase())
    }
  }, [mounted, owner, address])

  // Fetch properties when propertyCount or property1 changes
  useEffect(() => {
    if (mounted && propertyCount !== undefined) {
      fetchProperties()
    }
  }, [mounted, propertyCount, property1])

  // Create new property function
  const handleCreateProperty = async () => {
    if (!isOwner) return

    try {
      setLoading(true)
      const hash = await writeContract({
        address: registryAddress,
        abi: PROPERTY_REGISTRY_ABI,
        functionName: 'createProperty',
        args: [
          'New Test Property', // name
          BigInt(1000000 * 1e18), // depositCap (1M tokens)
          '0x0000000000000000000000000000000000000000' // underlyingAsset (zero address for now)
        ]
      })
      console.log('Property creation transaction:', hash)
    } catch (error) {
      console.error('Failed to create property:', error)
    } finally {
      setLoading(false)
    }
  }

  // Access denied component
  if (!mounted) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
            <h2 className="text-lg font-semibold text-yellow-800">Wallet Not Connected</h2>
          </div>
          <p className="text-yellow-700 mt-2">Please connect your wallet to access the management panel.</p>
        </div>
      </div>
    )
  }

  // Show network warning if not on localhost
  if (mounted && isConnected && chainId !== 31337) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
            <h2 className="text-lg font-semibold text-yellow-800">Wrong Network</h2>
          </div>
          <p className="text-yellow-700 mt-2">
            Please switch to Localhost network (Chain ID: 31337) to access the management panel.
          </p>
          <div className="mt-4">
            <button
              onClick={() => switchChain({ chainId: 31337 })}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm"
            >
              Switch to Localhost
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (ownerLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
            <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
          </div>
          <p className="text-red-700 mt-2">
            You are not authorized to access this management panel. Only the contract owner can manage the platform.
          </p>
          <div className="mt-4 text-sm text-red-600">
            <p><strong>Contract Owner:</strong> {owner}</p>
            <p><strong>Your Address:</strong> {address}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Platform Management</h1>
          <p className="text-muted-foreground">Manage your BrickVault platform and properties</p>
        </div>

      {/* Owner Info */}
      <div className="bg-card rounded-lg border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Settings className="mr-2 h-5 w-5" />
          Owner Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Contract Owner</p>
            <p className="font-mono text-sm">{owner}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Connected Wallet</p>
            <p className="font-mono text-sm">{address}</p>
          </div>
        </div>
      </div>

      {/* Platform Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center">
            <Building2 className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <p className="text-sm text-muted-foreground">Total Properties</p>
              <p className="text-2xl font-bold">{propertyCount?.toString() || '0'}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <p className="text-sm text-muted-foreground">Active Properties</p>
              <p className="text-2xl font-bold">1</p>
            </div>
          </div>
        </div>
        
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-purple-500 mr-3" />
            <div>
              <p className="text-sm text-muted-foreground">Total Deposits</p>
              <p className="text-2xl font-bold">0 OFTUSDC</p>
            </div>
          </div>
        </div>
      </div>

      {/* Properties List */}
      <div className="bg-card rounded-lg border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Building2 className="mr-2 h-5 w-5" />
            Properties Management
          </h2>
          <span className="text-sm text-muted-foreground">
            {properties.length} of {propertyCount?.toString() || '0'} properties
          </span>
        </div>

        {properties.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No properties found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first property to get started
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {properties.map((property) => (
              <div key={property.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">Property #{property.id}</h3>
                    <p className="text-sm text-muted-foreground flex items-center">
                      <MapPin className="mr-1 h-3 w-3" />
                      Vault: {property.vault.slice(0, 6)}...{property.vault.slice(-4)}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center">
                      <Calendar className="mr-1 h-3 w-3" />
                      Created: {new Date(Number(property.createdAt) * 1000).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      property.status === 1 
                        ? 'bg-green-100 text-green-800' 
                        : property.status === 2
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {property.status === 1 ? 'Active' : property.status === 2 ? 'Paused' : 'Inactive'}
                    </span>
                    {property.paused && (
                      <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                        Paused
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center">
                    <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Deposit Cap</p>
                      <p className="font-semibold">{(Number(property.depositCap) / 1e18).toFixed(0)} OFTUSDC</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total Deposited</p>
                      <p className="font-semibold">{(Number(property.totalDeposited) / 1e18).toFixed(2)} OFTUSDC</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-semibold">{property.status}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Actions</p>
                      <div className="flex space-x-2">
                        <button className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">
                          <Eye className="h-3 w-3 inline mr-1" />
                          View
                        </button>
                        {property.status === 1 ? (
                          <button className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-200">
                            <Pause className="h-3 w-3 inline mr-1" />
                            Pause
                          </button>
                        ) : (
                          <button className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200">
                            <Play className="h-3 w-3 inline mr-1" />
                            Resume
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Management Actions */}
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Settings className="mr-2 h-5 w-5" />
          Management Actions
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleCreateProperty}
            disabled={loading}
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            <Plus className="h-6 w-6 mr-2" />
            <div className="text-left">
              <p className="font-semibold">Create New Property</p>
              <p className="text-sm text-muted-foreground">Deploy a new property vault</p>
            </div>
          </button>

          <button
            disabled
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg opacity-50"
          >
            <Settings className="h-6 w-6 mr-2" />
            <div className="text-left">
              <p className="font-semibold">Update Settings</p>
              <p className="text-sm text-muted-foreground">Modify platform parameters</p>
            </div>
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
