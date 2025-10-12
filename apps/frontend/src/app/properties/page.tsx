'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
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
  ChevronDown,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { 
  PROPERTY_REGISTRY_ABI, 
  PROPERTY_VAULT_GOVERNANCE_ABI,
  PROPERTY_DAO_ABI,
  OFT_USDC_ABI
} from '@brickvault/abi'
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS, NETWORK_CONFIG } from '../../config/contracts'

interface PropertyCard {
  id: string
  name: string
  location: string
  price: string
  totalShares: string
  pricePerShare: string
  status: string
  registryStatus: number  // 0 = Inactive, 1 = Active (from PropertyRegistry)
  imageUrl?: string
  description: string
  vaultAddress: string
  depositCap: string
  totalDeposited: string
  createdAt: number
  isPurchased: boolean
  fundingProgress: number
  category: string
  // DAO information
  daoAddress?: string
  daoStage: number
  daoFundingProgress: number
  daoIsFullyFunded: boolean
  daoInvested: string
  daoFundingTarget: string
  // Property management
  propertyAddress?: string
  propertyTokenAddress?: string
  totalRentHarvested: string
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
  
  // Investment modal state
  const [showInvestmentModal, setShowInvestmentModal] = useState(false)
  const [investmentAmount, setInvestmentAmount] = useState('')
  const [isInvesting, setIsInvesting] = useState(false)
  const [investmentStep, setInvestmentStep] = useState<'idle' | 'approving' | 'approved' | 'investing'>('idle')
  
  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const publicClient = usePublicClient()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}` | undefined,
  })
  
  // Type assertion to fix ReactNode issue
  const isConfirmedTyped = Boolean(isConfirmed) as boolean
  const isConfirmedSuccess = Boolean(isConfirmed) as boolean
  const showSuccessMessage: boolean = isConfirmed === true
  
  // Track investment approval transaction separately
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>()
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } = useWaitForTransactionReceipt({
    hash: approvalHash,
  })
  
  // Type assertion to fix ReactNode issue
  const isConfirmingBool = Boolean(isConfirming) as boolean
  const isConfirmedBool = Boolean(isConfirmed) as boolean

  const registryAddress = process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as `0x${string}`

  // Get property count
  const { data: propertyCount, error: countError, isLoading: countLoading, refetch: refetchPropertyCount } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getPropertyCount',
    query: {
      enabled: !!registryAddress && isConnected && mounted && chainId === NETWORK_CONFIG.chainId,
    },
  })

  // No need for single property fetch - we'll fetch all properties dynamically

  // Note: Vault data is now fetched dynamically for each property in the useEffect

  // Get user's OFTUSDC balance
  const { data: oftBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.OFTUSDC as `0x${string}`,
    abi: OFT_USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected && mounted && chainId === NETWORK_CONFIG.chainId,
    },
  })

  // Get OFTUSDC allowance for the selected property's vault
  const { data: oftAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.OFTUSDC as `0x${string}`,
    abi: OFT_USDC_ABI,
    functionName: 'allowance',
    args: address && selectedProperty ? [address, selectedProperty.vaultAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!selectedProperty && isConnected && mounted && chainId === NETWORK_CONFIG.chainId,
    },
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  // Track approval transaction hash when it's created
  useEffect(() => {
    if (hash && investmentStep === 'approving') {
      setApprovalHash(hash)
    }
  }, [hash, investmentStep])

  // Auto-trigger investment after approval is confirmed
  useEffect(() => {
    if (isApprovalConfirmed && investmentStep === 'approving') {
      setInvestmentStep('approved')
      // Proceed to investment after approval is confirmed
      setTimeout(() => {
        depositToVault()
      }, 100) // Minimal delay to ensure state updates are processed
    }
  }, [isApprovalConfirmed, investmentStep])

  // Reset investment step when transaction is completed or there's an error
  useEffect(() => {
    if (isConfirmed && investmentStep === 'investing') {
      setInvestmentStep('idle')
      setApprovalHash(undefined)
    }
    if (error) {
      setInvestmentStep('idle')
      setApprovalHash(undefined)
    }
  }, [isConfirmed, error, investmentStep])

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
  const getPropertyStatusText = (daoStage: number, status: number): string => {
    // Use DAO stage if available, otherwise fall back to registry status
    if (daoStage !== undefined) {
      switch (daoStage) {
        case 0: return 'Open to Fund'
        case 1: return 'Funded'
        case 2: return 'Under Management'
        case 3: return 'Liquidating'
        case 4: return 'Liquidated'
        default: return 'Unknown'
      }
    }
    
    // Fallback to registry status
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

  const generateDescription = (vaultAddress: string, depositCap: bigint, totalDeposited: bigint, status: number, daoStage?: number): string => {
    const fundingPercentage = Number(depositCap) > 0 ? (Number(totalDeposited) / Number(depositCap)) * 100 : 0
    const statusText = getPropertyStatusText(daoStage || 0, status)
    
    let description = `Premium tokenized real estate investment opportunity. `
    description += `Located in a prime ${generateLocation(vaultAddress).toLowerCase()} location. `
    
    if (fundingPercentage > 0) {
      description += `Currently ${fundingPercentage.toFixed(1)}% funded with ${(Number(totalDeposited) / 1e18).toFixed(2)} OFTUSDC invested. `
    }
    
    switch (statusText) {
      case 'Open to Fund':
        description += 'Now accepting new investments with competitive returns.'
        break
      case 'Funded':
        description += 'Funding complete. Property purchase proposal in voting.'
        break
      case 'Under Management':
        description += 'Property is actively managed and generating rental income for investors.'
        break
      case 'Liquidating':
        description += 'Property is being liquidated. All operations are frozen.'
        break
      case 'Liquidated':
        description += 'Property has been liquidated. Investors can redeem their shares for proceeds.'
        break
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

  const getPropertyImage = (propertyId: number): string => {
    // Cycle through p1.jpg, p2.jpg, p3.jpg based on property ID
    const imageNumber = ((propertyId - 1) % 3) + 1
    return `/p${imageNumber}.jpg`
  }

  // Investment functions
  const approveOFTUSDC = async () => {
    if (!investmentAmount || !selectedProperty) return
    
    const amount = parseUnits(investmentAmount, TOKEN_DECIMALS.OFTUSDC)
    
    setInvestmentStep('approving')
    console.log('🔐 Approving OFTUSDC for investment:');
    console.log('  - Amount:', investmentAmount, 'OFTUSDC');
    console.log('  - Vault Address:', selectedProperty.vaultAddress);
    console.log('  - Property Name:', selectedProperty.name);
    
    writeContract({
      address: CONTRACT_ADDRESSES.OFTUSDC as `0x${string}`,
      abi: OFT_USDC_ABI,
      functionName: 'approve',
      args: [selectedProperty.vaultAddress as `0x${string}`, amount],
      gas: BigInt(100000),
    })
  }

  const depositToVault = async () => {
    if (!investmentAmount || !address || !selectedProperty) return
    
    const amount = parseUnits(investmentAmount, TOKEN_DECIMALS.OFTUSDC)
    
    setInvestmentStep('investing')
    console.log('💰 Depositing to vault:');
    console.log('  - Amount:', investmentAmount, 'OFTUSDC');
    console.log('  - Vault Address:', selectedProperty.vaultAddress);
    console.log('  - Property Name:', selectedProperty.name);
    console.log('  - Investor Address:', address);
    
    writeContract({
      address: selectedProperty.vaultAddress as `0x${string}`,
      abi: PROPERTY_VAULT_GOVERNANCE_ABI,
      functionName: 'deposit',
      args: [amount, address],
      gas: BigInt(500000),
    })
  }

  const handleInvest = (property: PropertyCard) => {
    setSelectedProperty(property)
    setShowInvestmentModal(true)
    setInvestmentAmount('')
  }

  const closeInvestmentModal = () => {
    setShowInvestmentModal(false)
    setSelectedProperty(null)
    setInvestmentAmount('')
    setInvestmentStep('idle')
    setApprovalHash(undefined)
  }

  // Combined function: Approve OFTUSDC then invest
  const approveAndInvest = async () => {
    if (!investmentAmount || !selectedProperty) return
    
    const amount = parseUnits(investmentAmount, TOKEN_DECIMALS.OFTUSDC)
    
    // Check if we already have sufficient allowance
    const currentAllowance = oftAllowance as bigint || BigInt(0)
    if (currentAllowance >= amount) {
      // We already have enough allowance, proceed directly to invest
      setInvestmentStep('investing')
      await depositToVault()
      return
    }
    
    // Step 1: Approve OFTUSDC
    setInvestmentStep('approving')
    writeContract({
      address: CONTRACT_ADDRESSES.OFTUSDC as `0x${string}`,
      abi: OFT_USDC_ABI,
      functionName: 'approve',
      args: [selectedProperty.vaultAddress as `0x${string}`, amount],
      gas: BigInt(100000),
    })
  }

  // Manual refresh function
  const refreshProperties = async () => {
    try {
      setIsRefreshing(true)
      setLoading(true)
      
      // First refetch the property count from the contract
      const result = await refetchPropertyCount()
      
      // Force re-fetch of properties even if count hasn't changed
      if (!publicClient) {
        console.error('❌ No publicClient available for fetching properties')
        setLoading(false)
        return
      }

      const count = result.data || propertyCount
      if (!count || count === 0) {
        console.log('📋 No properties found in registry')
        setProperties([])
        setLoading(false)
        return
      }

      console.log(`🔍 Refreshing ${Number(count)} properties from network...`)

      const fetchedProperties: PropertyCard[] = []
      const totalCount = Number(count as bigint)
      
      // Fetch all properties dynamically
      for (let i = 1; i <= totalCount; i++) {
        try {
          // Fetch property data from contract
          const propertyData = await publicClient.readContract({
            address: registryAddress,
            abi: PROPERTY_REGISTRY_ABI,
            functionName: 'getProperty',
            args: [i],
          })

          if (propertyData) {
            // Handle both array and object formats from contract
            let vault: string, depositCap: bigint, totalDeposited: bigint, status: number, createdAt: number;
            
            if (Array.isArray(propertyData) && propertyData.length >= 5) {
              // Array format: [vault, depositCap, totalDeposited, status, createdAt]
              [vault, depositCap, totalDeposited, status, createdAt] = propertyData as [string, bigint, bigint, number, number];
            } else if (propertyData && typeof propertyData === 'object') {
              const property = propertyData as { vault: string; depositCap: bigint; totalDeposited: bigint; status: number; createdAt: bigint }
              vault = property.vault;
              depositCap = property.depositCap;
              totalDeposited = property.totalDeposited;
              status = property.status;
              createdAt = Number(property.createdAt);
            } else {
              console.warn(`Invalid property data format for property #${i}`)
              continue
            }
            
            const vaultAddress = vault as string;
            
            // Get property name from vault
            let propertyName: string;
            try {
              const vaultName = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'name',
              }) as string;
              propertyName = vaultName || `Property #${i}`;
            } catch (error) {
              propertyName = `Property #${i}`;
            }
            
            // Fetch DAO information
            let daoAddress: string | undefined;
            let daoStage = 0;
            let daoFundingProgress = 0;
            let daoIsFullyFunded = false;
            let daoInvested = '0';
            let daoFundingTarget = '0';
            let propertyAddress: string | undefined;
            let propertyTokenAddress: string | undefined;
            let totalRentHarvested = '0';
        
            try {
              const vaultDAO = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'dao',
              }) as string;
          
              if (vaultDAO && vaultDAO !== '0x0000000000000000000000000000000000000000') {
                daoAddress = vaultDAO;
                
                const propertyInfo = await publicClient?.readContract({
                  address: vaultDAO as `0x${string}`,
                  abi: PROPERTY_DAO_ABI,
                  functionName: 'propertyInfo',
                }) as any;
                
                if (propertyInfo && Array.isArray(propertyInfo) && propertyInfo.length >= 6) {
                  const [stage, totalValue, totalInvested, fundingTarget, fundingDeadline, isFullyFunded] = propertyInfo;
                  
                  daoStage = Number(stage);
                  daoInvested = formatUnits(totalInvested, 18);
                  daoFundingTarget = formatUnits(fundingTarget, 18);
                  daoFundingProgress = Number(fundingTarget) > 0 ? (Number(totalInvested) / Number(fundingTarget)) * 100 : 0;
                  daoIsFullyFunded = isFullyFunded;
                  
                  if (daoStage >= 2) {
                    try {
                      const propAddress = await publicClient?.readContract({
                        address: vaultDAO as `0x${string}`,
                        abi: PROPERTY_DAO_ABI,
                        functionName: 'propertyAddress',
                      }) as string;
                      propertyAddress = propAddress;
                    } catch (error) {
                      // Property address not available
                    }
                  }
                }
              }
            } catch (error) {
              // DAO info fetch failed
            }
        
            // Get property token address
            try {
              const tokenAddress = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'getPropertyToken',
              }) as string;
              
              if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
                propertyTokenAddress = tokenAddress;
              }
            } catch (error) {
              // Property token address not available
            }
        
            // Get total rent harvested
            try {
              const rentHarvested = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'totalRentHarvested',
              }) as bigint;
              
              totalRentHarvested = formatUnits(rentHarvested, 18);
            } catch (error) {
              // Total rent harvested not available
            }
        
            // Get vault total assets and supply
            let totalAssets = totalDeposited;
            let totalSupply = BigInt(1000000) * BigInt(1e18);
        
            try {
              const vaultTotalAssets = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'totalAssets',
              }) as bigint;
              
              if (vaultTotalAssets) {
                totalAssets = vaultTotalAssets;
              }
            } catch (error) {
              // Use default
            }
        
            try {
              const vaultTotalSupply = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'totalSupply',
              }) as bigint;
              
              if (vaultTotalSupply) {
                totalSupply = vaultTotalSupply;
              }
            } catch (error) {
              // Use default
            }
        
            const fundingProgress = Number(depositCap) > 0 
              ? (Number(totalAssets) / Number(depositCap)) * 100 
              : 0
        
            const pricePerShare = totalSupply && totalAssets && Number(totalSupply) > 0 
              ? Number(totalAssets) / Number(totalSupply) / 1e18 
              : 1.0
            
            // Calculate remaining funding needed (shares available)
            const remainingFunding = depositCap > totalAssets ? depositCap - totalAssets : BigInt(0)
        
            const propertyCard: PropertyCard = {
              id: i.toString(),
              name: propertyName,
              location: propertyName,
              price: `${(Number(depositCap) / 1e18 / 1000).toFixed(0)}K`,
              totalShares: (Number(remainingFunding) / 1e18).toFixed(0), // Shares available = remaining funding needed
              pricePerShare: (Number(depositCap) / 1e18).toFixed(0), // Total shares = deposit cap

              status: getPropertyStatusText(daoStage, Number(status)),
              registryStatus: Number(status), // 0 = Inactive, 1 = Active
              imageUrl: getPropertyImage(i),
              description: generateDescription(vaultAddress, depositCap, totalDeposited, Number(status), daoStage),
              vaultAddress: vaultAddress,
              depositCap: (Number(depositCap) / 1e18).toFixed(0),
              totalDeposited: totalAssets ? (Number(totalAssets) / 1e18).toFixed(2) : (Number(totalDeposited) / 1e18).toFixed(2),
              createdAt: Number(createdAt),
              isPurchased: totalAssets ? Number(totalAssets) > 0 : Number(totalDeposited) > 0,
              fundingProgress,
              category: getPropertyCategory(vaultAddress),
              daoAddress,
              daoStage,
              daoFundingProgress,
              daoIsFullyFunded,
              daoInvested,
              daoFundingTarget,
              propertyAddress,
              propertyTokenAddress,
              totalRentHarvested
            }
            
            fetchedProperties.push(propertyCard)
          }
        } catch (error) {
          console.error(`❌ Error fetching property #${i}:`, error)
        }
      }

      console.log(`✅ Successfully refreshed ${fetchedProperties.length} properties`)
      setProperties(fetchedProperties)
      setLoading(false)
    } catch (error) {
      console.error('Error refreshing properties:', error)
      setLoading(false)
    } finally {
      setIsRefreshing(false)
    }
  }



  // Create property cards from contract data
  useEffect(() => {
    if (!mounted) {
      return
    }
    
    const fetchPropertyData = async () => {
      if (!publicClient) {
        console.error('❌ No publicClient available for fetching properties')
        setLoading(false)
        return
      }

      if (!propertyCount || propertyCount === 0) {
        console.log('📋 No properties found in registry')
        setProperties([])
        setLoading(false)
        return
      }

      console.log(`🔍 Fetching ${Number(propertyCount)} properties from network...`)
      setLoading(true)

      const fetchedProperties: PropertyCard[] = []
      const totalCount = Number(propertyCount as bigint)
      
      // Fetch all properties dynamically
      for (let i = 1; i <= totalCount; i++) {
        try {
          // Fetch property data from contract
          const propertyData = await publicClient.readContract({
            address: registryAddress,
            abi: PROPERTY_REGISTRY_ABI,
            functionName: 'getProperty',
            args: [i],
          })

          if (propertyData) {
            // Handle both array and object formats from contract
            let vault: string, depositCap: bigint, totalDeposited: bigint, status: number, createdAt: number;
            
            if (Array.isArray(propertyData) && propertyData.length >= 5) {
              // Array format: [vault, depositCap, totalDeposited, status, createdAt]
              [vault, depositCap, totalDeposited, status, createdAt] = propertyData as [string, bigint, bigint, number, number];
            } else if (propertyData && typeof propertyData === 'object') {
              // Object format: { vault, depositCap, totalDeposited, status, createdAt }
              const property = propertyData as { vault: string; depositCap: bigint; totalDeposited: bigint; status: number; createdAt: bigint }
              vault = property.vault;
              depositCap = property.depositCap;
              totalDeposited = property.totalDeposited;
              status = property.status;
              createdAt = Number(property.createdAt);
            } else {
              console.warn(`Invalid property data format for property #${i}`)
              continue
            }
            
            const vaultAddress = vault as string;
            
            // Get property name from vault (ERC20 name function) - just like in our test!
            let propertyName: string;
            try {
              const vaultName = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'name',
              }) as string;
              propertyName = vaultName || generatePropertyName(vaultAddress);
              console.log(`✅ Property #${i} name from vault:`, propertyName);
            } catch (error) {
              console.warn(`❌ Could not fetch property name for vault ${vaultAddress}:`, error);
              propertyName = generatePropertyName(vaultAddress);
              console.log(`🔄 Using generated name:`, propertyName);
            }
            
            // Fetch DAO information
            let daoAddress: string | undefined;
            let daoStage = 0;
            let daoFundingProgress = 0;
            let daoIsFullyFunded = false;
            let daoInvested = '0';
            let daoFundingTarget = '0';
            let propertyAddress: string | undefined;
            let propertyTokenAddress: string | undefined;
            let totalRentHarvested = '0';
        
            try {
              // Check if vault has DAO set
              const vaultDAO = await publicClient?.readContract({
                address: vaultAddress as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'dao',
              }) as string;
          
          if (vaultDAO && vaultDAO !== '0x0000000000000000000000000000000000000000') {
            daoAddress = vaultDAO;
            
            // Get DAO funding status
            const propertyInfo = await publicClient?.readContract({
              address: vaultDAO as `0x${string}`,
              abi: PROPERTY_DAO_ABI,
              functionName: 'propertyInfo',
            }) as any;
            
            if (propertyInfo && Array.isArray(propertyInfo) && propertyInfo.length >= 6) {
              const [stage, totalValue, totalInvested, fundingTarget, fundingDeadline, isFullyFunded] = propertyInfo;
              
              daoStage = Number(stage);
              daoInvested = formatUnits(totalInvested, 18);
              daoFundingTarget = formatUnits(fundingTarget, 18);
              daoFundingProgress = Number(fundingTarget) > 0 ? (Number(totalInvested) / Number(fundingTarget)) * 100 : 0;
              daoIsFullyFunded = isFullyFunded;
              
              // Get property address if purchased
              if (daoStage >= 2) {
                try {
                  const propAddress = await publicClient?.readContract({
                    address: vaultDAO as `0x${string}`,
                    abi: PROPERTY_DAO_ABI,
                    functionName: 'propertyAddress',
                  }) as string;
                  propertyAddress = propAddress;
                } catch (error) {
                  console.warn('Could not fetch property address:', error);
                }
              }
            }
          }
        } catch (error) {
          console.warn('Could not fetch DAO info:', error);
        }
        
        // Get property token address if exists
        try {
          const tokenAddress = await publicClient?.readContract({
            address: vaultAddress as `0x${string}`,
            abi: PROPERTY_VAULT_GOVERNANCE_ABI,
            functionName: 'getPropertyToken',
          }) as string;
          
          if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
            propertyTokenAddress = tokenAddress;
          }
        } catch (error) {
          console.warn('Could not fetch property token address:', error);
        }
        
        // Get total rent harvested
        try {
          const rentHarvested = await publicClient?.readContract({
            address: vaultAddress as `0x${string}`,
            abi: PROPERTY_VAULT_GOVERNANCE_ABI,
            functionName: 'totalRentHarvested',
          }) as bigint;
          
          totalRentHarvested = formatUnits(rentHarvested, 18);
        } catch (error) {
          console.warn('Could not fetch total rent harvested:', error);
        }
        
        // Get vault total assets and supply for accurate pricing
        let totalAssets = totalDeposited; // Default to totalDeposited
        let totalSupply = BigInt(1000000) * BigInt(1e18); // Default 1M shares
        
        try {
          const vaultTotalAssets = await publicClient?.readContract({
            address: vaultAddress as `0x${string}`,
            abi: PROPERTY_VAULT_GOVERNANCE_ABI,
            functionName: 'totalAssets',
          }) as bigint;
          
          if (vaultTotalAssets) {
            totalAssets = vaultTotalAssets;
          }
        } catch (error) {
          console.warn('Could not fetch totalAssets:', error);
        }
        
        try {
          const vaultTotalSupply = await publicClient?.readContract({
            address: vaultAddress as `0x${string}`,
            abi: PROPERTY_VAULT_GOVERNANCE_ABI,
            functionName: 'totalSupply',
          }) as bigint;
          
          if (vaultTotalSupply) {
            totalSupply = vaultTotalSupply;
          }
        } catch (error) {
          console.warn('Could not fetch totalSupply:', error);
        }
        
        const fundingProgress = Number(depositCap) > 0 
          ? (Number(totalAssets) / Number(depositCap)) * 100 
          : 0
        
        const pricePerShare = totalSupply && totalAssets && Number(totalSupply) > 0 
          ? Number(totalAssets) / Number(totalSupply) / 1e18 
          : 1.0
        
        // Calculate remaining funding needed (shares available)
        const remainingFunding = depositCap > totalAssets ? depositCap - totalAssets : BigInt(0)
        
            const propertyCard: PropertyCard = {
              id: i.toString(),
              name: propertyName,
              location: propertyName,
              price: `${(Number(depositCap) / 1e18 / 1000).toFixed(0)}K`,
              totalShares: (Number(remainingFunding) / 1e18).toFixed(0), // Shares available = remaining funding needed
              pricePerShare: (Number(depositCap) / 1e18).toFixed(0), // Total shares = deposit cap

              status: getPropertyStatusText(daoStage, Number(status)),
              registryStatus: Number(status), // 0 = Inactive, 1 = Active
              imageUrl: getPropertyImage(i),
              description: generateDescription(vaultAddress, depositCap, totalDeposited, Number(status), daoStage),
              vaultAddress: vaultAddress,
              depositCap: (Number(depositCap) / 1e18).toFixed(0),
              totalDeposited: totalAssets ? (Number(totalAssets) / 1e18).toFixed(2) : (Number(totalDeposited) / 1e18).toFixed(2),
              createdAt: Number(createdAt),
              isPurchased: totalAssets ? Number(totalAssets) > 0 : Number(totalDeposited) > 0,
              fundingProgress,
              category: getPropertyCategory(vaultAddress),
              // DAO information
              daoAddress,
              daoStage,
              daoFundingProgress,
              daoIsFullyFunded,
              daoInvested,
              daoFundingTarget,
              // Property management
              propertyAddress,
              propertyTokenAddress,
              totalRentHarvested
            }
            
            fetchedProperties.push(propertyCard)
          }
        } catch (error) {
          console.error(`❌ Error fetching property #${i}:`, error)
          // Continue with other properties even if one fails
        }
      }

      console.log(`✅ Successfully fetched ${fetchedProperties.length} properties`)
      setProperties(fetchedProperties)
      setLoading(false)
    };
    
    fetchPropertyData();
  }, [mounted, propertyCount, isConnected, chainId, publicClient])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open to Fund': return 'bg-yellow-100 text-yellow-800'
      case 'Funded': return 'bg-blue-100 text-blue-800'
      case 'Under Management': return 'bg-green-100 text-green-800'
      case 'Liquidating': return 'bg-orange-100 text-orange-800'
      case 'Liquidated': return 'bg-red-100 text-red-800'
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
    
    // Show active properties and also show liquidating/liquidated for transparency
    // Only hide inactive (registryStatus === 0) properties
    const isActive = property.registryStatus === 1
    
    return matchesSearch && matchesCategory && isActive
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
                  <p>Please switch to <strong>{NETWORK_CONFIG.name} (Chain ID: {NETWORK_CONFIG.chainId})</strong> to view property data.</p>
                  <p className="mt-1">Current network: Chain ID {chainId}</p>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => switchChain({ chainId: NETWORK_CONFIG.chainId })}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Switch to {NETWORK_CONFIG.name}
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
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {propertyCount ? `${propertyCount} Properties` : 'Loading...'}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Live Data
              </span>
            </div>
            <button
              onClick={refreshProperties}
              disabled={isRefreshing || loading}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span>Refresh</span>
                </>
              )}
            </button>
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
                <div className={`relative overflow-hidden ${
                  viewMode === 'list' ? 'w-64 flex-shrink-0' : 'aspect-video'
                }`}>
                  <img 
                    src={property.imageUrl} 
                    alt={property.name}
                    className="w-full h-full object-cover"
                  />
                  
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
                      <h3 className="text-xl font-semibold line-clamp-1 text-orange-600">{property.name}</h3>
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
                    <p className="text-xs text-muted-foreground">Total: ${property.pricePerShare} shares</p>
                  </div>

                  {/* Stats */}
                  <div className={`grid gap-3 mb-4 ${viewMode === 'list' ? 'grid-cols-4' : 'grid-cols-2'}`}>
                    <div>
                      <p className="text-xs text-muted-foreground">Shares Available</p>
                      <p className="font-semibold">{property.totalShares}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vault Funded</p>
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

                  {/* Progress Bars */}
                  <div className="mb-4 space-y-2">
                    {/* Vault Progress */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted-foreground">Vault Funding</span>
                        <span className="text-xs text-muted-foreground">{property.fundingProgress.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(property.fundingProgress, 100)}%` }}
                        ></div>
                      </div>
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
                  <h2 className="text-3xl font-bold text-orange-600">{selectedProperty.name}</h2>
                  <button
                    onClick={() => setSelectedProperty(null)}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Image */}
                <div className="aspect-video rounded-lg mb-6 overflow-hidden">
                  <img 
                    src={selectedProperty.imageUrl} 
                    alt={selectedProperty.name}
                    className="w-full h-full object-cover"
                  />
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
                      <span className="text-sm text-muted-foreground">Shares Available</span>
                    </div>
                    <p className="text-2xl font-bold">{selectedProperty.totalShares}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Total Shares</span>
                    </div>
                    <p className="text-2xl font-bold">{selectedProperty.pricePerShare}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Vault Progress</span>
                    </div>
                    <p className="text-2xl font-bold">{selectedProperty.fundingProgress.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Funded</p>
                  </div>

                </div>

                {/* DAO Information */}
                {selectedProperty.daoAddress && (
                  <div className="bg-accent rounded-lg p-4 mb-6">
                    <h3 className="font-semibold mb-3">DAO Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">DAO Address:</span>
                        <p className="font-mono text-xs">{selectedProperty.daoAddress.slice(0, 6)}...{selectedProperty.daoAddress.slice(-4)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stage:</span>
                        <p className="font-semibold">{selectedProperty.status}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">DAO Invested:</span>
                        <p className="font-semibold">{selectedProperty.daoInvested} OFTUSDC</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Funding Target:</span>
                        <p className="font-semibold">{selectedProperty.daoFundingTarget} OFTUSDC</p>
                      </div>
                      {selectedProperty.propertyAddress && (
                        <div className="md:col-span-2">
                          <span className="text-muted-foreground">Property Address:</span>
                          <p className="font-semibold">{selectedProperty.propertyAddress}</p>
                        </div>
                      )}
                      {selectedProperty.totalRentHarvested !== '0' && (
                        <div className="md:col-span-2">
                          <span className="text-muted-foreground">Total Rent Harvested:</span>
                          <p className="font-semibold">{selectedProperty.totalRentHarvested} OFTUSDC</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleInvest(selectedProperty)}
                    className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      selectedProperty.status === 'Open to Fund' 
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    disabled={selectedProperty.status !== 'Open to Fund'}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {selectedProperty.status === 'Open to Fund' ? 'Invest Now' : 
                     selectedProperty.status === 'Funded' ? 'Voting in Progress' :
                     selectedProperty.status === 'Under Management' ? 'Property Active' :
                     selectedProperty.status === 'Liquidating' ? 'Liquidation in Progress' :
                     selectedProperty.status === 'Liquidated' ? 'Liquidation Complete' :
                     `Property ${selectedProperty.status}`}
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

        {/* Investment Modal */}
        {showInvestmentModal && selectedProperty && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Invest in <span className="text-orange-600">{selectedProperty.name}</span></h2>
                  <button
                    onClick={closeInvestmentModal}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Property Info */}
                <div className="bg-accent rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Total Value (Deposit Cap)</span>
                    <span className="font-semibold">${selectedProperty.depositCap} OFTUSDC</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Total Shares</span>
                    <span className="font-semibold">{selectedProperty.pricePerShare}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Shares Available</span>
                    <span className="font-semibold">{selectedProperty.totalShares}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Funding Progress</span>
                    <span className="font-semibold">{selectedProperty.fundingProgress.toFixed(1)}%</span>
                  </div>
                </div>

                {/* User Balance */}
                <div className="bg-accent rounded-lg p-4 mb-6">
                  <h3 className="font-semibold mb-2">Your Balance</h3>
                  <p className="text-2xl font-bold text-primary">
                    {oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
                  </p>
                </div>

                {/* Investment Amount Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Investment Amount (OFTUSDC)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      value={investmentAmount}
                      onChange={(e) => setInvestmentAmount(e.target.value)}
                      className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                      placeholder="Enter amount to invest"
                      step="0.000001"
                      min="0"
                    />
                    <button
                      onClick={() => {
                        // Max is the remaining capacity (deposit cap - total deposited)
                        const maxAvailable = selectedProperty.totalShares
                        setInvestmentAmount(maxAvailable)
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                      disabled={!selectedProperty.totalShares || Number(selectedProperty.totalShares) <= 0}
                    >
                      Max
                    </button>
                  </div>
                  {investmentAmount && (
                    <p className="text-sm text-muted-foreground mt-1">
                      You will receive {investmentAmount} vault shares (1:1 ratio)
                    </p>
                  )}
                </div>

                {/* Transaction Status */}
                {(isPending || isConfirming) && (
                  <div className="bg-accent border border-border rounded-lg p-4 mb-4">
                    <div className="flex items-center">
                      <Loader2 className="animate-spin h-4 w-4 text-primary mr-3" />
                      <span className="text-foreground">Transaction pending...</span>
                    </div>
                  </div>
                )}

                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(isConfirmed as any) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-600 mr-3" />
                      <span className="text-green-800">Investment successful!</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-red-600 mr-3" />
                      <span className="text-red-800">Error: {error.message || String(error)}</span>
                    </div>
                  </div>
                )}

                {/* Status indicator */}
                {investmentStep !== 'idle' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      {investmentStep === 'approving' && (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm text-blue-800">
                            {isPending ? 'Step 1: Approving OFTUSDC... Please confirm the transaction in your wallet.' :
                             isApprovalConfirming ? 'Step 1: Waiting for approval confirmation on-chain...' :
                             'Step 1: Approving OFTUSDC...'}
                          </span>
                        </>
                      )}
                      {investmentStep === 'approved' && (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-800">Step 1 Complete: OFTUSDC approved! Now investing...</span>
                        </>
                      )}
                      {investmentStep === 'investing' && (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm text-blue-800">Step 2: Investing in property... Please confirm the transaction in your wallet.</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={approveAndInvest}
                    disabled={isPending || isApprovalConfirming || !investmentAmount}
                    className="flex-1 px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-all duration-200 font-semibold"
                  >
                    {investmentStep === 'approving' && isPending ? 'Approving OFTUSDC...' :
                     investmentStep === 'approved' && isPending ? 'Investing...' :
                     isPending ? 'Processing...' :
                     'Approve & Invest Now'}
                  </button>
                </div>

                {/* Allowance Info */}
                {oftAllowance && (
                  <p className="text-sm text-muted-foreground mt-4">
                    Current Allowance: {formatUnits(oftAllowance as bigint, TOKEN_DECIMALS.OFTUSDC)} OFTUSDC
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}