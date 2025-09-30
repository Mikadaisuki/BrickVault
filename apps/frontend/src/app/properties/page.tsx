'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { Header } from '@/components/Header'
import { 
  Building2, 
  MapPin, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Clock, 
  Eye, 
  X, 
  ShoppingCart, 
  Heart,
  Search,
  Filter,
  Grid3X3,
  List,
  ChevronDown
} from 'lucide-react'
import { 
  PROPERTY_REGISTRY_ABI, 
  PROPERTY_VAULT_ABI 
} from '@brickvault/abi'

interface PropertyCard {
  id: string
  name: string
  location: string
  price: string
  totalShares: string
  pricePerShare: string
  status: string
  imageUrl?: string
  description: string
  vaultAddress: string
  depositCap: string
  totalDeposited: string
  createdAt: number
  isPurchased: boolean
  fundingProgress: number
  category: string
}

export default function PropertiesPage() {
  const [mounted, setMounted] = useState(false)
  const [properties, setProperties] = useState<PropertyCard[]>([])
  const [selectedProperty, setSelectedProperty] = useState<PropertyCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const registryAddress = process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as `0x${string}`

  // Get property count
  const { data: propertyCount, error: countError, isLoading: countLoading } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getPropertyCount',
    query: {
      enabled: !!registryAddress && isConnected && mounted && chainId === 31337,
    },
  })

  // Get first property data
  const { data: property1, error: propertyError, isLoading: propertyLoading } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getProperty',
    args: [1],
    query: {
      enabled: !!registryAddress && isConnected && mounted && chainId === 31337,
    },
  })

  // Get vault data
  const { data: totalAssets, error: assetsError } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'totalAssets',
    query: {
      enabled: !!process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS && isConnected && mounted && chainId === 31337,
    },
  })

  const { data: totalSupply, error: supplyError } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROPERTY_VAULT_ADDRESS as `0x${string}`,
    abi: PROPERTY_VAULT_ABI,
    functionName: 'totalSupply',
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
    setMounted(true)
  }, [])

  // Timeout fallback to prevent infinite loading
  useEffect(() => {
    if (mounted && loading) {
      const timeout = setTimeout(() => {
        setLoading(false)
      }, 15000) // 15 second timeout

      return () => clearTimeout(timeout)
    }
  }, [mounted, loading])

  // Helper functions
  const getPropertyStatusText = (status: number): string => {
    switch (status) {
      case 0: return 'Draft'
      case 1: return 'Active'
      case 2: return 'Paused'
      case 3: return 'Sold'
      case 4: return 'Cancelled'
      default: return 'Unknown'
    }
  }

  const generatePropertyName = (vaultAddress: string): string => {
    const suffix = vaultAddress.slice(-4).toUpperCase()
    const prefix = vaultAddress.slice(2, 6).toUpperCase()
    return `Luxury Property ${prefix}-${suffix}`
  }

  const generateLocation = (vaultAddress: string): string => {
    const regionCode = vaultAddress.slice(6, 10).toUpperCase()
    const cityCode = vaultAddress.slice(10, 14).toUpperCase()
    return `${regionCode} District, ${cityCode}`
  }

  const generateDescription = (vaultAddress: string, depositCap: bigint, totalDeposited: bigint, status: number): string => {
    const fundingPercentage = Number(depositCap) > 0 ? (Number(totalDeposited) / Number(depositCap)) * 100 : 0
    const statusText = getPropertyStatusText(status)
    
    let description = `Premium tokenized real estate investment opportunity. `
    description += `Located in a prime ${generateLocation(vaultAddress).toLowerCase()} location. `
    
    if (fundingPercentage > 0) {
      description += `Currently ${fundingPercentage.toFixed(1)}% funded with ${(Number(totalDeposited) / 1e18).toFixed(2)} OFTUSDC invested. `
    }
    
    switch (statusText) {
      case 'Active':
        description += 'Now accepting new investments with competitive returns.'
        break
      case 'Paused':
        description += 'Investment temporarily paused for maintenance.'
        break
      case 'Sold':
        description += 'Property has been successfully sold to investors.'
        break
      default:
        description += 'Property is being prepared for investment.'
    }
    
    return description
  }

  const getPropertyCategory = (vaultAddress: string): string => {
    const categories = ['Commercial', 'Residential', 'Mixed-Use', 'Industrial', 'Retail']
    const index = parseInt(vaultAddress.slice(-1), 16) % categories.length
    return categories[index]
  }


  // Create property cards from contract data
  useEffect(() => {
    if (!mounted) {
      return
    }
    
    
    // If we have property data, create property cards (use same logic as working PropertyOverview)
    if (mounted && propertyCount && propertyCount > 0 && property1) {
      
      // Handle both array and object formats from contract
      let vault, depositCap, totalDeposited, status, isPurchased, createdAt;
      
      if (Array.isArray(property1) && property1.length >= 6) {
        // Array format: [vault, depositCap, totalDeposited, status, isPurchased, createdAt]
        [vault, depositCap, totalDeposited, status, isPurchased, createdAt] = property1;
      } else if (property1 && typeof property1 === 'object') {
        // Object format: { vault, depositCap, totalDeposited, status, paused, createdAt }
        vault = property1.vault;
        depositCap = property1.depositCap;
        totalDeposited = property1.totalDeposited;
        status = property1.status;
        isPurchased = property1.paused; // Use paused as isPurchased indicator
        createdAt = property1.createdAt;
      } else {
        setLoading(false);
        return;
      }
      
      const vaultAddress = vault as string;
      
      const fundingProgress = Number(depositCap) > 0 
        ? (Number(totalAssets) / Number(depositCap)) * 100 
        : 0
      
      const pricePerShare = totalSupply && totalAssets && Number(totalSupply) > 0 
        ? Number(totalAssets) / Number(totalSupply) / 1e18 
        : 1.0
      
      const propertyCard: PropertyCard = {
        id: '1',
        name: propertyName as string || generatePropertyName(vaultAddress),
        location: propertyName as string || generatePropertyName(vaultAddress),
        price: `${(Number(depositCap) / 1e18 / 1000).toFixed(0)}K`,
        totalShares: totalSupply ? (Number(totalSupply) / 1e18).toFixed(0) : '1000000',
        pricePerShare: pricePerShare.toFixed(6),
        status: getPropertyStatusText(Number(status)),
        imageUrl: `/api/placeholder/400/300?vault=${vaultAddress.slice(-4)}`,
        description: generateDescription(vaultAddress, depositCap, totalDeposited, Number(status)),
        vaultAddress: vaultAddress,
        depositCap: (Number(depositCap) / 1e18).toFixed(0),
        totalDeposited: totalAssets ? (Number(totalAssets) / 1e18).toFixed(2) : (Number(totalDeposited) / 1e18).toFixed(2),
        createdAt: Number(createdAt),
        isPurchased: totalAssets ? Number(totalAssets) > 0 : Number(totalDeposited) > 0,
        fundingProgress,
        category: getPropertyCategory(vaultAddress)
      }
      
      setProperties([propertyCard])
      setLoading(false)
    } else if (mounted && propertyCount === 0) {
      setProperties([])
      setLoading(false)
    }
  }, [mounted, propertyCount, property1, totalAssets, totalSupply, propertyName, isConnected, chainId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800'
      case 'Draft': return 'bg-gray-100 text-gray-800'
      case 'Paused': return 'bg-yellow-100 text-yellow-800'
      case 'Sold': return 'bg-blue-100 text-blue-800'
      case 'Cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const toggleFavorite = (propertyId: string) => {
    setFavorites(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    )
  }

  const filteredProperties = properties.filter(property => {
    const matchesSearch = property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         property.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         property.category.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || property.category === selectedCategory
    
    return matchesSearch && matchesCategory
  })

  const sortedProperties = [...filteredProperties].sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return Number(a.depositCap) - Number(b.depositCap)
      case 'price-high':
        return Number(b.depositCap) - Number(a.depositCap)
      case 'progress':
        return b.fundingProgress - a.fundingProgress
      case 'newest':
      default:
        return b.createdAt - a.createdAt
    }
  })

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground">Connect your wallet to explore available properties</p>
          </div>
        </main>
      </div>
    )
  }

  // Show network warning if on wrong chain
  if (mounted && isConnected && chainId !== 31337) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
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
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Investment Properties
          </h1>
          <p className="text-muted-foreground text-lg">
            Discover tokenized real estate investment opportunities
          </p>
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {propertyCount ? `${propertyCount} Properties` : 'Loading...'}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              Live Data
            </span>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search properties, locations, or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none bg-background border border-border rounded-lg px-4 py-2 pr-8 focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="all">All Categories</option>
                <option value="Commercial">Commercial</option>
                <option value="Residential">Residential</option>
                <option value="Mixed-Use">Mixed-Use</option>
                <option value="Industrial">Industrial</option>
                <option value="Retail">Retail</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Sort */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-background border border-border rounded-lg px-4 py-2 pr-8 focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="newest">Newest First</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="progress">Most Funded</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* View Mode */}
            <div className="flex border border-border rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Properties Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground mb-2">Loading properties...</p>
          </div>
        ) : sortedProperties.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No Properties Found</h2>
            <p className="text-muted-foreground">
              {searchTerm || selectedCategory !== 'all' 
                ? 'Try adjusting your search or filter criteria' 
                : 'Check back later for new investment opportunities'
              }
            </p>
          </div>
        ) : (
          <div className={`grid gap-6 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
              : 'grid-cols-1'
          }`}>
            {sortedProperties.map((property) => (
              <div
                key={property.id}
                className={`bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group ${
                  viewMode === 'list' ? 'flex' : ''
                }`}
                onClick={() => setSelectedProperty(property)}
              >
                {/* Property Image */}
                <div className={`bg-gradient-to-br from-blue-500 to-purple-600 relative overflow-hidden ${
                  viewMode === 'list' ? 'w-64 flex-shrink-0' : 'aspect-video'
                }`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Building2 className="h-16 w-16 text-white opacity-80" />
                  </div>
                  
                  {/* Status Badge */}
                  <div className="absolute top-4 left-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(property.status)}`}>
                      {property.status}
                    </span>
                  </div>
                  
                  {/* Favorite Button */}
                  <div className="absolute top-4 right-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(property.id)
                      }}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                      <Heart 
                        className={`h-4 w-4 ${
                          favorites.includes(property.id) 
                            ? 'fill-red-500 text-red-500' 
                            : 'text-white'
                        }`} 
                      />
                    </button>
                  </div>

                  {/* Category Badge */}
                  <div className="absolute bottom-4 left-4">
                    <span className="px-2 py-1 bg-black/20 text-white text-xs rounded-full">
                      {property.category}
                    </span>
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Eye className="h-8 w-8 text-white" />
                    </div>
                  </div>
                </div>

                {/* Property Info */}
                <div className={`p-6 ${viewMode === 'list' ? 'flex-1' : ''}`}>
                  {/* Header */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-semibold line-clamp-1">{property.name}</h3>
                    </div>
                    <p className="text-muted-foreground flex items-center text-sm">
                      <MapPin className="h-3 w-3 mr-1" />
                      {property.location}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary">${property.price}</span>
                      <span className="text-sm text-muted-foreground">OFTUSDC</span>
                    </div>
                    <p className="text-xs text-muted-foreground">${property.pricePerShare} per share</p>
                  </div>

                  {/* Stats */}
                  <div className={`grid gap-3 mb-4 ${viewMode === 'list' ? 'grid-cols-4' : 'grid-cols-2'}`}>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Shares</p>
                      <p className="font-semibold">{property.totalShares}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Funded</p>
                      <p className="font-semibold">{property.fundingProgress.toFixed(1)}%</p>
                    </div>
                    {viewMode === 'list' && (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground">Deposited</p>
                          <p className="font-semibold">{property.totalDeposited} OFTUSDC</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(property.fundingProgress, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      Listed {new Date(property.createdAt * 1000).toLocaleDateString()}
                    </div>
                    {property.isPurchased && (
                      <div className="flex items-center text-green-600">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Active
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Property Detail Modal */}
        {selectedProperty && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-3xl font-bold">{selectedProperty.name}</h2>
                  <button
                    onClick={() => setSelectedProperty(null)}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Image */}
                <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg mb-6 flex items-center justify-center">
                  <Building2 className="h-20 w-20 text-white opacity-80" />
                </div>

                {/* Description */}
                <div className="mb-6">
                  <p className="text-muted-foreground leading-relaxed">{selectedProperty.description}</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-accent rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Total Value</span>
                    </div>
                    <p className="text-2xl font-bold">${selectedProperty.depositCap}</p>
                    <p className="text-xs text-muted-foreground">OFTUSDC</p>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Shares</span>
                    </div>
                    <p className="text-2xl font-bold">{selectedProperty.totalShares}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Progress</span>
                    </div>
                    <p className="text-2xl font-bold">{selectedProperty.fundingProgress.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Funded</p>
                  </div>

                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button 
                    className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      selectedProperty.status === 'Active' 
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    disabled={selectedProperty.status !== 'Active'}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {selectedProperty.status === 'Active' ? 'Invest Now' : `Property ${selectedProperty.status}`}
                  </button>
                  
                  <button
                    onClick={() => toggleFavorite(selectedProperty.id)}
                    className={`px-6 py-3 rounded-lg border transition-colors flex items-center gap-2 ${
                      favorites.includes(selectedProperty.id)
                        ? 'border-red-500 text-red-500 bg-red-50'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <Heart 
                      className={`h-4 w-4 ${
                        favorites.includes(selectedProperty.id) 
                          ? 'fill-current' 
                          : ''
                      }`} 
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}