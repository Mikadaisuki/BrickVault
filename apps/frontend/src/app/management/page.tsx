'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { Building2, Users, Settings, Plus, Pause, Play, DollarSign, AlertTriangle, Eye, MapPin, Calendar, CheckCircle, FileText, TrendingUp, X, Clock, Vote, Loader2, ExternalLink, Copy, CheckCircle2 } from 'lucide-react'
import { PROPERTY_REGISTRY_ABI, PROPERTY_VAULT_GOVERNANCE_ABI, PROPERTY_DAO_ABI, PROPERTY_DAO_FACTORY_ABI } from '@brickvault/abi'
import { CONTRACT_ADDRESSES } from '../../config/contracts'
import { Header } from '@/components/Header'
import { formatUnits } from 'viem'

interface PropertyData {
  id: number
  name: string
  vault: string
  depositCap: bigint
  totalDeposited: bigint
  status: number
  paused: boolean
  createdAt: bigint
  // Vault funding information
  vaultFundingProgress: number
  vaultIsFunded: boolean
  // DAO funding information
  daoAddress?: string
  daoInvested: bigint
  daoFundingTarget: bigint
  daoFundingProgress: number
  daoIsFullyFunded: boolean
  daoStage: number
  // Property management
  propertyAddress?: string
  propertyTokenAddress?: string
  totalRentHarvested: bigint
  // Proposals
  purchaseProposalId?: number
  purchaseProposalStatus?: string
}

interface Proposal {
  id: number
  proposer: string
  proposalType: number
  description: string
  deadline: bigint
  executed: boolean
  votesFor: bigint
  votesAgainst: bigint
  status: string
  canExecute: boolean
}

export default function ManagementPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [fetchingProperties, setFetchingProperties] = useState(false)
  const [propertiesError, setPropertiesError] = useState<string | null>(null)
  
  // Property detail modal state
  const [selectedProperty, setSelectedProperty] = useState<PropertyData | null>(null)
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [propertyProposals, setPropertyProposals] = useState<Proposal[]>([])
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [proposalExecutable, setProposalExecutable] = useState<boolean>(false)
  
  // Property creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [propertyName, setPropertyName] = useState('')
  const [depositCap, setDepositCap] = useState('')
  const [fundingTarget, setFundingTarget] = useState('')
  const [fundingDeadline, setFundingDeadline] = useState('')
  
  // Step-by-step creation state
  const [creationStep, setCreationStep] = useState(1)
  const [createdPropertyId, setCreatedPropertyId] = useState<number | null>(null)
  const [createdVaultAddress, setCreatedVaultAddress] = useState<string | null>(null)
  const [createdDAOAddress, setCreatedDAOAddress] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [manualVaultAddress, setManualVaultAddress] = useState('')
  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<'pending' | 'confirmed' | 'error' | null>(null)
  const [creationProgress, setCreationProgress] = useState(0)
  
  // Property management state
  const [showManagementModal, setShowManagementModal] = useState(false)
  const [rentAmount, setRentAmount] = useState('')
  const [navUpdateAmount, setNavUpdateAmount] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  
  // Rent harvest modal state
  const [showRentModal, setShowRentModal] = useState(false)
  const [selectedPropertyForRent, setSelectedPropertyForRent] = useState<PropertyData | null>(null)
  const [rentHarvestAmount, setRentHarvestAmount] = useState('')
  const [isHarvestingRent, setIsHarvestingRent] = useState(false)
  const [isApprovingRent, setIsApprovingRent] = useState(false)
  const [rentApprovalStatus, setRentApprovalStatus] = useState<'none' | 'approving' | 'approved'>('none')
  const [rentStep, setRentStep] = useState<'idle' | 'approving' | 'approved' | 'harvesting'>('idle')
  const [rentApprovalHash, setRentApprovalHash] = useState<`0x${string}` | undefined>()
  
  // NAV update modal state
  const [showNavModal, setShowNavModal] = useState(false)
  const [selectedPropertyForNav, setSelectedPropertyForNav] = useState<PropertyData | null>(null)
  const [navUpdateValue, setNavUpdateValue] = useState('')
  const [isUpdatingNav, setIsUpdatingNav] = useState(false)

  const registryAddress = CONTRACT_ADDRESSES.PropertyRegistry
  const propertyDAOAddress = CONTRACT_ADDRESSES.PropertyDAO
  const { writeContract, writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const publicClient = usePublicClient()
  
  // Track rent approval transaction separately
  const { isLoading: isRentApprovalConfirming, isSuccess: isRentApprovalConfirmed } = useWaitForTransactionReceipt({
    hash: rentApprovalHash,
  })

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


  // Fetch all properties using contract calls
  const fetchProperties = async (showLoading = true) => {
    if (!publicClient) {
      setPropertiesError('No blockchain connection available')
      return
    }

    if (!propertyCount || propertyCount === 0) {
      setProperties([])
      setPropertiesError(null)
      return
    }

    if (showLoading) {
      setFetchingProperties(true)
    }
    setPropertiesError(null)

    const fetchedProperties: PropertyData[] = []
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
          const property = propertyData as { name: string; vault: string; depositCap: bigint; totalDeposited: bigint; status: number; paused: boolean; createdAt: bigint }
          
          // Get actual deposited amount from the vault (totalAssets)
          let actualTotalDeposited = property.totalDeposited
          try {
            const vaultTotalAssets = await publicClient.readContract({
              address: property.vault as `0x${string}`,
              abi: PROPERTY_VAULT_GOVERNANCE_ABI,
              functionName: 'totalAssets',
            })
            actualTotalDeposited = vaultTotalAssets as bigint
          } catch (error) {
            // Fall back to registry's totalDeposited
          }
          
          // Calculate vault funding progress
          const vaultIsFunded = isPropertyFunded(actualTotalDeposited, property.depositCap)
          const vaultFundingProgress = calculateFundingProgress(actualTotalDeposited, property.depositCap)
          
          // Check if vault has DAO linked
          let daoAddress: string | undefined
          let daoInvested = BigInt(0)
          let daoFundingTarget = BigInt(0)
          let daoFundingProgress = 0
          let daoIsFullyFunded = false
          let daoStage = 0
          let propertyAddress: string | undefined
          let propertyTokenAddress: string | undefined
          let totalRentHarvested = BigInt(0)
          
          try {
            // Check if vault has DAO set
            const vaultDAO = await publicClient.readContract({
              address: property.vault as `0x${string}`,
              abi: PROPERTY_VAULT_GOVERNANCE_ABI,
              functionName: 'dao',
            }) as string
            
            if (vaultDAO && vaultDAO !== '0x0000000000000000000000000000000000000000') {
              daoAddress = vaultDAO
              
              // Get DAO funding status
            const propertyInfo = await publicClient.readContract({
                address: vaultDAO as `0x${string}`,
              abi: PROPERTY_DAO_ABI,
              functionName: 'propertyInfo',
            }) as any
            
            // PropertyInfo is returned as an array: [stage, totalValue, totalInvested, fundingTarget, fundingDeadline, isFullyFunded]
            const [stage, totalValue, totalInvested, daoFundingTargetRaw, fundingDeadline, isFullyFunded] = propertyInfo
            
            daoInvested = totalInvested
            daoFundingTarget = daoFundingTargetRaw
            daoFundingProgress = calculateFundingProgress(totalInvested, daoFundingTargetRaw)
            daoIsFullyFunded = isFullyFunded
            daoStage = Number(stage)
              
              // Get property address if purchased
              if (daoStage >= 2) { // UnderManagement
                try {
                  propertyAddress = await publicClient.readContract({
                    address: vaultDAO as `0x${string}`,
                    abi: PROPERTY_DAO_ABI,
                    functionName: 'propertyAddress',
                  }) as string
                } catch (error) {
                  // Property address not available
                }
              }
            
            }
          } catch (error) {
            // Set DAO values to defaults
            daoInvested = BigInt(0)
            daoFundingTarget = property.depositCap // Use deposit cap as fallback
            daoFundingProgress = 0
            daoIsFullyFunded = false
            daoStage = 0
          }
          
          // Get property token address if exists
          try {
            const tokenAddress = await publicClient.readContract({
              address: property.vault as `0x${string}`,
              abi: PROPERTY_VAULT_GOVERNANCE_ABI,
              functionName: 'getPropertyToken',
            }) as string
            
            if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
              propertyTokenAddress = tokenAddress
            }
          } catch (error) {
            // Property token address not available
          }
          
          // Get total rent harvested
          try {
            totalRentHarvested = await publicClient.readContract({
              address: property.vault as `0x${string}`,
              abi: PROPERTY_VAULT_GOVERNANCE_ABI,
              functionName: 'totalRentHarvested',
            }) as bigint
          } catch (error) {
            // Total rent harvested not available
          }
          
          
          fetchedProperties.push({
            id: i,
            name: property.name || `Property #${i}`,
            vault: property.vault,
            depositCap: property.depositCap,
            totalDeposited: actualTotalDeposited, // Use actual vault assets
            status: Number(property.status),
            paused: property.paused,
            createdAt: property.createdAt,
            // Vault funding information
            vaultFundingProgress,
            vaultIsFunded,
            // DAO funding information
            daoAddress,
            daoInvested,
            daoFundingTarget,
            daoFundingProgress,
            daoIsFullyFunded,
            daoStage,
            // Property management
            propertyAddress,
            propertyTokenAddress,
            totalRentHarvested
          })
        }
      } catch (error) {
        // Continue with other properties even if one fails
      }
    }

    setProperties(fetchedProperties)
    setFetchingProperties(false)
    setPropertiesError(null)
  }

  // Manual refresh function
  const refreshProperties = async () => {
    await fetchProperties(true)
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
        // Chain switch failed
      }
    }
  }, [mounted, isConnected, chainId, switchChain])

  useEffect(() => {
    if (mounted && owner && address) {
      setIsOwner(address.toLowerCase() === (owner as string).toLowerCase())
    }
  }, [mounted, owner, address])

  // Fetch properties when propertyCount changes
  useEffect(() => {
    if (mounted && propertyCount !== undefined && publicClient) {
      fetchProperties(false) // Don't show loading on initial fetch
    }
  }, [mounted, propertyCount, publicClient])

  // Track rent approval transaction hash when it's created
  useEffect(() => {
    if (hash && rentStep === 'approving') {
      setRentApprovalHash(hash)
    }
  }, [hash, rentStep])

  // Auto-trigger rent harvest after approval is confirmed
  useEffect(() => {
    if (isRentApprovalConfirmed && rentStep === 'approving') {
      setRentStep('approved')
      // Proceed to rent harvest after approval is confirmed
      setTimeout(() => {
        handleHarvestRent()
      }, 100) // Minimal delay to ensure state updates are processed
    }
  }, [isRentApprovalConfirmed, rentStep])

  // Reset rent step when transaction is completed or there's an error
  useEffect(() => {
    if (isPending === false && rentStep === 'harvesting') {
      setRentStep('idle')
      setRentApprovalHash(undefined)
    }
    if (error) {
      setRentStep('idle')
      setRentApprovalHash(undefined)
    }
  }, [isPending, error, rentStep])

  // Check if property is funded (reached deposit cap)
  const isPropertyFunded = (totalDeposited: bigint | undefined, depositCap: bigint | undefined): boolean => {
    if (!totalDeposited || !depositCap) return false
    return totalDeposited >= depositCap
  }

  // Calculate funding progress percentage
  const calculateFundingProgress = (totalDeposited: bigint | undefined, depositCap: bigint | undefined): number => {
    if (!totalDeposited || !depositCap || depositCap === BigInt(0)) return 0
    
    const progress = Number((totalDeposited * BigInt(10000)) / depositCap) / 100
    return progress
  }

  // Handle property click to show details and proposals
  const handlePropertyClick = async (property: PropertyData) => {
    setSelectedProperty(property)
    setShowPropertyModal(true)
    await fetchPropertyProposals(property.id)
  }

  // Fetch proposals for a specific property
  const fetchPropertyProposals = async (propertyId: number) => {
    
    if (!publicClient) {
      return
    }
    
    // Find the property to get its DAO address
    const property = properties.find(p => p.id === propertyId)
    
    if (!property || !property.daoAddress) {
      return
    }

    setLoadingProposals(true)
    try {
      
      // First, let's check if this PropertyDAO has any property info
      try {
        const propertyInfo = await publicClient.readContract({
          address: property.daoAddress as `0x${string}`,
          abi: PROPERTY_DAO_ABI,
          functionName: 'propertyInfo',
        }) as any
        
        // PropertyInfo is returned as an array: [stage, totalValue, totalInvested, fundingTarget, fundingDeadline, isFullyFunded]
        const [stage, totalValue, totalInvested, daoFundingTarget, fundingDeadline, isFullyFunded] = propertyInfo
      } catch (error) {
        // PropertyDAO propertyInfo not available
      }
      
      // Get the current proposal count from PropertyDAO
      const proposalCount = await publicClient.readContract({
        address: property.daoAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'proposalCount',
      }) as bigint
      


      const proposals: Proposal[] = []
      let hasExecutableProposal = false
      
      // Fetch all proposals (in a real implementation, you might want to filter by property)
      for (let i = 1; i <= Number(proposalCount); i++) {
        try {
          const proposal = await publicClient.readContract({
            address: property.daoAddress as `0x${string}`,
            abi: PROPERTY_DAO_ABI,
            functionName: 'proposals',
            args: [i],
          }) as any

          if (proposal) {
            // The proposal is returned as a struct array: [id, proposer, proposalType, description, deadline, votesFor, votesAgainst, executed, status, data]
            const [id, proposer, proposalType, description, deadline, votesFor, votesAgainst, executed, status, data] = proposal
            
            // Check if this proposal is executable
            let canExecute = false
            try {
              canExecute = await publicClient.readContract({
                address: property.daoAddress as `0x${string}`,
                abi: PROPERTY_DAO_ABI,
                functionName: 'canExecute',
                args: [i],
              }) as boolean
              
              if (canExecute) {
                hasExecutableProposal = true
              }
            } catch (error) {
              // canExecute function might not be available or proposal might not be executable
              canExecute = false
            }
            
            const proposalData = {
              id: Number(id), // Use the actual proposal ID from the contract
              proposer: proposer || '',
              proposalType: Number(proposalType || 0),
              description: description || 'No description',
              deadline: deadline || BigInt(0),
              executed: executed || false,
              votesFor: votesFor || BigInt(0),
              votesAgainst: votesAgainst || BigInt(0),
              status: Number(status) === 0 ? 'Active' : 
                     Number(status) === 1 ? 'Executed' :
                     Number(status) === 2 ? 'Rejected' : 'Expired',
              canExecute: canExecute
            }
            proposals.push(proposalData)
          }
        } catch (error) {
          // Skip this proposal if fetch fails
        }
      }
      
      setPropertyProposals(proposals)
      setProposalExecutable(hasExecutableProposal)
    } catch (error) {
      setPropertyProposals([])
      setProposalExecutable(false)
    } finally {
      setLoadingProposals(false)
    }
  }


  // Close property modal
  const closePropertyModal = () => {
    setShowPropertyModal(false)
    setSelectedProperty(null)
    setPropertyProposals([])
  }

  // Step 1: Create property via PropertyRegistry (uses VaultFactory internally)
  const handleCreateProperty = async () => {
    if (!isOwner) return

    try {
      setIsCreating(true)
      setTxStatus('pending')
      setCreationProgress(10)
      
      // Use writeContractAsync for proper async handling
      const createTx = await writeContractAsync({
        address: registryAddress,
        abi: PROPERTY_REGISTRY_ABI,
        functionName: 'createProperty',
        args: [
          propertyName || 'New Property',
          BigInt(Number(depositCap) * 1e18), // Convert to wei
          CONTRACT_ADDRESSES.OFTUSDC // Use OFTUSDC as underlying asset
        ]
      })
      
      setCurrentTxHash(createTx)
      setCreationProgress(30)
      
      if (!createTx) {
        throw new Error('Transaction hash is undefined - transaction may have failed')
      }
      
      // Wait for transaction to be mined
      setCreationProgress(50)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: createTx })
      
      
      if (receipt) {
        // Look for logs from the PropertyRegistry contract
        const registryLogs = receipt.logs.filter(log => 
          log.address.toLowerCase() === registryAddress.toLowerCase()
        )
        
        // Find the PropertyCreated event by looking for logs with 3 topics (event signature + 2 indexed params)
        const propertyCreatedEvent = registryLogs.find(log => 
          log.topics.length === 3 // PropertyCreated has 2 indexed parameters
        )
        
        
        if (propertyCreatedEvent) {
          // Extract propertyId from topic[1] (indexed)
          const propertyId = Number(BigInt(propertyCreatedEvent.topics[1] || '0'))
          
          // Extract vault address from topic[2] (indexed)
          const vaultAddress = '0x' + (propertyCreatedEvent.topics[2] || '').slice(26)
          
          
          setCreationProgress(100)
          setTxStatus('confirmed')
          setCreatedPropertyId(propertyId)
          setCreatedVaultAddress(vaultAddress)
          
          // Show success message
          setTimeout(() => {
            setCreationStep(2) // Move to step 2
            setIsCreating(false)
            setTxStatus(null)
            setCurrentTxHash(null)
            setCreationProgress(0)
          }, 1500)
        } else {
          // Fallback: If transaction was successful but we can't parse the event,
          // we can still proceed with a mock property ID and ask user to continue
          alert('Property creation transaction completed successfully! However, we could not parse the event details. You can continue to the next step manually.')
          
          // Set mock values and allow user to continue
          setCreatedPropertyId(1) // Use property ID 1 as fallback
          setCreatedVaultAddress('0x0000000000000000000000000000000000000000') // Will be updated when we can get the real address
          setCreationStep(2) // Move to step 2
          setIsCreating(false)
        }
      } else {
        alert('No transaction receipt received. Please try again.')
        setIsCreating(false)
      }
    } catch (error) {
      setTxStatus('error')
      setCreationProgress(0)
      alert('Failed to create property. Please try again.')
      setIsCreating(false)
    }
  }

  // Step 2: Deploy PropertyDAO
  const handleDeployDAO = async () => {
    if (!createdVaultAddress || !address) return

    try {
      setIsCreating(true)
      setTxStatus('pending')
      setCreationProgress(10)
      
      // Use PropertyDAOFactory to deploy a new PropertyDAO
      const daoFactoryAddress = CONTRACT_ADDRESSES.PropertyDAOFactory
      
      if (!daoFactoryAddress || daoFactoryAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('PropertyDAOFactory address not configured. Please deploy the factory contract first.')
      }
      
      
      const deployTx = await writeContractAsync({
        address: daoFactoryAddress as `0x${string}`,
        abi: PROPERTY_DAO_FACTORY_ABI,
        functionName: 'createPropertyDAO',
        args: [
          createdVaultAddress as `0x${string}`,
          address as `0x${string}`
        ]
      })
      
      setCurrentTxHash(deployTx)
      setCreationProgress(30)
      
      if (!deployTx) {
        throw new Error('Transaction hash is undefined - transaction may have failed')
      }
      
      // Wait for transaction to be mined
      setCreationProgress(50)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: deployTx })
      
      if (receipt) {
        // Look for PropertyDAOCreated event
        const daoCreatedEvent = receipt.logs.find(log => 
          log.address.toLowerCase() === daoFactoryAddress.toLowerCase() &&
          log.topics.length === 4 // PropertyDAOCreated has 3 indexed parameters
        )
        
        if (daoCreatedEvent) {
          // Extract DAO address from topic[1] (indexed)
          const daoAddress = '0x' + (daoCreatedEvent.topics[1] || '').slice(26)
          
          
          setCreationProgress(100)
          setTxStatus('confirmed')
          setCreatedDAOAddress(daoAddress)
          
          // Show success message
          setTimeout(() => {
            setCreationStep(3) // Move to step 3
            setIsCreating(false)
            setTxStatus(null)
            setCurrentTxHash(null)
            setCreationProgress(0)
          }, 1500)
        } else {
          alert('PropertyDAO deployment completed but event not found. Please try again.')
          setIsCreating(false)
        }
      } else {
        alert('No transaction receipt received. Please try again.')
        setIsCreating(false)
      }
    } catch (error) {
      setTxStatus('error')
      setCreationProgress(0)
      alert('Failed to deploy DAO. Please try again.')
      setIsCreating(false)
    }
  }

  // Step 3: Link DAO to Vault
  const handleLinkDAO = async () => {
    if (!createdVaultAddress || !createdDAOAddress) return

    try {
      setIsCreating(true)
      setTxStatus('pending')
      setCreationProgress(10)
      
      const linkTx = await writeContractAsync({
        address: createdVaultAddress as `0x${string}`,
        abi: PROPERTY_VAULT_GOVERNANCE_ABI,
        functionName: 'setDAO',
        args: [createdDAOAddress as `0x${string}`]
      })
      
      setCurrentTxHash(linkTx)
      setCreationProgress(30)
      
      if (!linkTx) {
        throw new Error('Transaction hash is undefined - transaction may have failed')
      }
      
      // Wait for transaction to be mined
      setCreationProgress(50)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: linkTx })
      
      if (receipt) {
        
        setCreationProgress(100)
        setTxStatus('confirmed')
        
        // Show success message
        setTimeout(() => {
          setCreationStep(4) // Move to step 4
          setIsCreating(false)
          setTxStatus(null)
          setCurrentTxHash(null)
          setCreationProgress(0)
        }, 1500)
      } else {
        alert('No transaction receipt received. Please try again.')
        setIsCreating(false)
      }
    } catch (error) {
      setTxStatus('error')
      setCreationProgress(0)
      alert('Failed to link DAO. Please try again.')
      setIsCreating(false)
    }
  }

  // Step 4: Set funding target
  const handleSetFundingTarget = async () => {
    if (!createdDAOAddress || !fundingTarget || !fundingDeadline) return

    try {
      setIsCreating(true)
      setTxStatus('pending')
      setCreationProgress(10)
      
      const fundingTargetTx = await writeContractAsync({
        address: createdDAOAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'setFundingTarget',
        args: [
          BigInt(Number(fundingTarget) * 1e18), // Convert to wei
          Math.floor(new Date(fundingDeadline).getTime() / 1000) // Convert to unix timestamp
        ]
      })
      
      setCurrentTxHash(fundingTargetTx)
      setCreationProgress(30)
      
      if (!fundingTargetTx) {
        throw new Error('Transaction hash is undefined - transaction may have failed')
      }
      
      // Wait for transaction to be mined
      setCreationProgress(50)
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: fundingTargetTx })
      
      if (receipt) {
        
        setCreationProgress(100)
        setTxStatus('confirmed')
        
        // Show success message and reset
        setTimeout(() => {
          // Reset form and close modal
          setPropertyName('')
          setDepositCap('')
          setFundingTarget('')
          setFundingDeadline('')
          setCreationStep(1)
          setCreatedPropertyId(null)
          setCreatedVaultAddress(null)
          setCreatedDAOAddress(null)
          setCurrentTxHash(null)
          setTxStatus(null)
          setCreationProgress(0)
          setIsCreating(false)
          setShowCreateModal(false)
          
          // Refresh properties
          setTimeout(() => {
            refreshProperties()
          }, 1000)
        }, 2000)
      } else {
        alert('No transaction receipt received. Please try again.')
        setIsCreating(false)
      }
    } catch (error) {
      setTxStatus('error')
      setCreationProgress(0)
      alert('Failed to set funding target. Please try again.')
      setIsCreating(false)
    }
  }

  // Reset creation flow
  const resetCreationFlow = () => {
    setCreationStep(1)
    setCreatedPropertyId(null)
    setCreatedVaultAddress(null)
    setCreatedDAOAddress(null)
    setManualVaultAddress('')
    setPropertyName('')
    setDepositCap('')
    setFundingTarget('')
    setFundingDeadline('')
    setCurrentTxHash(null)
    setTxStatus(null)
    setCreationProgress(0)
    setIsCreating(false)
    setShowCreateModal(false)
  }



  // Function to execute proposal
  const handleExecuteProposal = async (proposalId: number, daoAddress: string) => {
    if (!isOwner) return

    try {
      setLoading(true)
      
      const hash = await writeContractAsync({
        address: daoAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'executeProposal',
        args: [proposalId]
      })
      
      alert(`Successfully executed proposal ${proposalId}`)
      
      // Refresh properties after a short delay
      setTimeout(() => {
        fetchProperties()
        if (selectedProperty) {
          fetchPropertyProposals(selectedProperty.id)
        }
      }, 2000)
    } catch (error) {
      alert('Failed to execute proposal. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Function to complete property purchase
  const handleCompletePropertyPurchase = async (daoAddress: string) => {
    if (!isOwner) return

    const address = prompt('Enter property address:')
    if (!address) {
      alert('Please enter a property address')
      return
    }

    try {
      setLoading(true)
      
      const hash = await writeContractAsync({
        address: daoAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'completePropertyPurchase',
        args: [address]
      })
      
      alert(`Successfully completed property purchase at ${address}`)
      
      // Refresh properties after a short delay
      setTimeout(() => {
        fetchProperties()
      }, 2000)
    } catch (error) {
      alert('Failed to complete property purchase. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Function to open rent harvest modal
  const handleOpenRentModal = (property: PropertyData) => {
    setSelectedPropertyForRent(property)
    setRentHarvestAmount('')
    setRentApprovalStatus('none')
    setRentStep('idle')
    setRentApprovalHash(undefined)
    setShowRentModal(true)
  }

  // Combined function: Approve OFTUSDC then harvest rent
  const approveAndHarvestRent = async () => {
    if (!isOwner || !selectedPropertyForRent || !rentHarvestAmount) return

    if (isNaN(Number(rentHarvestAmount)) || Number(rentHarvestAmount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    // Check if we already have sufficient allowance
    // For now, we'll always approve first, but this could be enhanced to check current allowance
    setRentStep('approving')
    setRentApprovalStatus('approving')
    setIsApprovingRent(true)
    
    const amountInWei = BigInt(Number(rentHarvestAmount) * 1e18)
    
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.OFTUSDC as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "address", "name": "spender", "type": "address"},
              {"internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [selectedPropertyForRent.vault as `0x${string}`, amountInWei]
      })
      
      setRentApprovalStatus('approved')
    } catch (error) {
      setRentApprovalStatus('none')
      setRentStep('idle')
      alert('Failed to approve OFTUSDC. Please try again.')
    } finally {
      setIsApprovingRent(false)
    }
  }

  // Function to approve OFTUSDC for rent harvest
  const handleApproveRent = async () => {
    if (!isOwner || !selectedPropertyForRent || !rentHarvestAmount) return

    if (isNaN(Number(rentHarvestAmount)) || Number(rentHarvestAmount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    try {
      setIsApprovingRent(true)
      setRentApprovalStatus('approving')
      setRentStep('approving')
      
      const amountInWei = BigInt(Number(rentHarvestAmount) * 1e18)
      
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.OFTUSDC as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "address", "name": "spender", "type": "address"},
              {"internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [selectedPropertyForRent.vault as `0x${string}`, amountInWei]
      })
      
      setRentApprovalStatus('approved')
    } catch (error) {
      setRentApprovalStatus('none')
      setRentStep('idle')
      alert('Failed to approve OFTUSDC. Please try again.')
    } finally {
      setIsApprovingRent(false)
    }
  }

  // Function to harvest rent
  const handleHarvestRent = async () => {
    if (!isOwner || !selectedPropertyForRent || !rentHarvestAmount) return

    if (isNaN(Number(rentHarvestAmount)) || Number(rentHarvestAmount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (rentApprovalStatus !== 'approved') {
      alert('Please approve OFTUSDC first before harvesting rent')
      return
    }

    try {
      setIsHarvestingRent(true)
      setRentStep('harvesting')
      
      const amountInWei = BigInt(Number(rentHarvestAmount) * 1e18)
      
      // Harvest rent (this will transferFrom the caller to the vault)
      const hash = await writeContractAsync({
        address: selectedPropertyForRent.vault as `0x${string}`,
        abi: PROPERTY_VAULT_GOVERNANCE_ABI,
        functionName: 'harvestRent',
        args: [amountInWei]
      })
      
      alert(`Successfully harvested ${rentHarvestAmount} OFTUSDC rent`)
      
      // Close modal and refresh properties
      setShowRentModal(false)
      setSelectedPropertyForRent(null)
      setRentHarvestAmount('')
      setRentApprovalStatus('none')
      setRentStep('idle')
      setRentApprovalHash(undefined)
      
      setTimeout(() => {
        fetchProperties()
      }, 2000)
    } catch (error) {
      setRentStep('idle')
      alert('Failed to harvest rent. Please try again.')
    } finally {
      setIsHarvestingRent(false)
    }
  }

  // Function to open NAV update modal
  const handleOpenNavModal = (property: PropertyData) => {
    setSelectedPropertyForNav(property)
    setNavUpdateValue('')
    setShowNavModal(true)
  }

  // Function to update NAV
  const handleUpdateNAV = async () => {
    if (!isOwner || !selectedPropertyForNav || !navUpdateValue) return

    if (isNaN(Number(navUpdateValue))) {
      alert('Please enter a valid amount')
      return
    }

    try {
      setIsUpdatingNav(true)
      
      const amountInWei = BigInt(Number(navUpdateValue) * 1e18)
      
      const hash = await writeContractAsync({
        address: selectedPropertyForNav.vault as `0x${string}`,
        abi: PROPERTY_VAULT_GOVERNANCE_ABI,
        functionName: 'updateNAV',
        args: [amountInWei]
      })
      
      alert(`Successfully updated NAV by ${navUpdateValue} OFTUSDC`)
      
      // Close modal and refresh properties
      setShowNavModal(false)
      setSelectedPropertyForNav(null)
      setNavUpdateValue('')
      
      setTimeout(() => {
        fetchProperties()
      }, 2000)
    } catch (error) {
      alert('Failed to update NAV. Please try again.')
    } finally {
      setIsUpdatingNav(false)
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
            <p><strong>Contract Owner:</strong> {owner as string}</p>
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

      {/* Network & Connection Status */}
      <div className="bg-card rounded-lg border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Settings className="mr-2 h-5 w-5" />
          Network & Connection Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Network</p>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                chainId === 31337 ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <p className="font-semibold text-sm">
                {chainId === 31337 ? 'Localhost (31337)' : `Chain ID: ${chainId}`}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Wallet Status</p>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <p className="font-semibold text-sm">
                {isConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Blockchain Connection</p>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                publicClient ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <p className="font-semibold text-sm">
                {publicClient ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
        </div>
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
            <p className="font-mono text-sm">{owner as string}</p>
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
              <p className="text-sm text-muted-foreground">DAO Funded Properties</p>
              <p className="text-2xl font-bold">{properties.filter(p => p.daoIsFullyFunded).length}</p>
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

      {/* Funded Properties Alert */}
      {properties.filter(p => p.daoIsFullyFunded).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-center">
            <CheckCircle className="h-6 w-6 text-blue-500 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-blue-800">Properties Ready for Purchase</h3>
              <p className="text-blue-700 mt-1">
                {properties.filter(p => p.daoIsFullyFunded).length} property(ies) have reached their DAO funding goals and are ready for purchase proposals.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Properties List */}
      <div className="bg-card rounded-lg border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Building2 className="mr-2 h-5 w-5" />
            Properties Management
          </h2>
          <div className="flex items-center space-x-3">
          <span className="text-sm text-muted-foreground">
            {properties.length} of {propertyCount?.toString() || '0'} properties
          </span>
            <button
              onClick={refreshProperties}
              disabled={fetchingProperties}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
            >
              {fetchingProperties ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <Building2 className="h-3 w-3" />
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error State */}
        {propertiesError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error Loading Properties</h3>
                <p className="text-sm text-red-700 mt-1">{propertiesError}</p>
              </div>
            </div>
            <button
              onClick={refreshProperties}
              className="mt-3 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {fetchingProperties && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
              <div>
                <h3 className="text-sm font-medium text-blue-800">Loading Properties</h3>
                <p className="text-sm text-blue-700 mt-1">Fetching property data from the blockchain...</p>
              </div>
            </div>
          </div>
        )}

        {properties.length === 0 && !fetchingProperties ? (
          <div className="text-center py-8">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No properties found</p>
            <p className="text-sm text-muted-foreground mt-2">
              {propertyCount && Number(propertyCount) > 0 
                ? "Properties exist but couldn't be loaded. Try refreshing."
                : "Create your first property to get started"
              }
            </p>
            {propertyCount && Number(propertyCount) > 0 ? (
              <button
                onClick={refreshProperties}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Refresh Properties
              </button>
            ) : null}
          </div>
        ) : properties.length > 0 && (
          <div className="space-y-4">
            {properties.map((property) => (
              <div 
                key={property.id} 
                className="border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-primary"
                onClick={() => handlePropertyClick(property)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{property.name}</h3>
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
                      property.daoStage === 2
                        ? 'bg-green-100 text-green-800' 
                        : property.daoStage === 1
                        ? 'bg-blue-100 text-blue-800'
                        : property.daoStage === 0
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {property.daoStage === 2 ? 'Under Management' : 
                       property.daoStage === 1 ? 'Funded' : 
                       property.daoStage === 0 ? 'Open to Fund' : 'Unknown'}
                    </span>
                    {property.paused && !property.daoIsFullyFunded && (
                      <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                        Paused
                      </span>
                    )}
                    {property.daoIsFullyFunded && (
                      <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 flex items-center">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Ready for Purchase
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Dual Funding Progress Bars */}
                <div className="mb-4 space-y-3">
                  {/* Vault Funding Progress */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-foreground flex items-center">
                        <Building2 className="h-3 w-3 mr-1" />
                        Vault Funding
                      </span>
                      <span className="text-sm text-muted-foreground">{property.vaultFundingProgress.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          property.vaultIsFunded ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(property.vaultFundingProgress, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatUnits(property.totalDeposited, 18)} OFTUSDC</span>
                      <span>{formatUnits(property.depositCap, 18)} OFTUSDC</span>
                    </div>
                  </div>
                  
                  {/* DAO Funding Progress */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-foreground flex items-center">
                        <Vote className="h-3 w-3 mr-1" />
                        DAO Funding
                      </span>
                      <span className="text-sm text-muted-foreground">{property.daoFundingProgress.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          property.daoIsFullyFunded ? 'bg-purple-500' : 'bg-orange-500'
                        }`}
                        style={{ width: `${Math.min(property.daoFundingProgress, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatUnits(property.daoInvested, 18)} OFTUSDC</span>
                      <span>{formatUnits(property.daoFundingTarget, 18)} OFTUSDC</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center">
                    <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Deposit Cap</p>
                      <p className="font-semibold">{formatUnits(property.depositCap, 18)} OFTUSDC</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <TrendingUp className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total Deposited</p>
                      <p className="font-semibold">{formatUnits(property.totalDeposited, 18)} OFTUSDC</p>
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
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePropertyClick(property)
                          }}
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                        >
                          <Eye className="h-3 w-3 inline mr-1" />
                          View Details
                        </button>
                        {property.daoIsFullyFunded ? (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            <CheckCircle className="h-3 w-3 inline mr-1" />
                            Auto-Proposal Created
                          </span>
                        ) : property.status === 1 ? (
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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            <Plus className="h-6 w-6 mr-2" />
            <div className="text-left">
              <p className="font-semibold">Create New Property</p>
              <p className="text-sm text-muted-foreground">Deploy a new property vault with DAO</p>
            </div>
          </button>

          <button
            onClick={() => setShowManagementModal(true)}
            disabled={loading}
            className="flex items-center justify-center p-4 border-2 border-dashed border-blue-300 rounded-lg hover:border-blue-400 transition-colors disabled:opacity-50 bg-blue-50"
          >
            <Settings className="h-6 w-6 mr-2 text-blue-600" />
            <div className="text-left">
              <p className="font-semibold text-blue-800">Property Management</p>
              <p className="text-sm text-blue-600">Manage rent, NAV, and proposals</p>
            </div>
          </button>

          <button
            disabled
            className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg opacity-50"
          >
            <Settings className="h-6 w-6 mr-2" />
            <div className="text-left">
              <p className="font-semibold">Platform Settings</p>
              <p className="text-sm text-muted-foreground">Modify platform parameters</p>
            </div>
          </button>
        </div>
      </div>

      {/* Property Detail Modal */}
      {showPropertyModal && selectedProperty && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold">{selectedProperty.name} Details</h2>
                <button
                  onClick={closePropertyModal}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Property Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-accent rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Property Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Vault Address:</span>
                      <span className="font-mono text-sm">{selectedProperty.vault.slice(0, 6)}...{selectedProperty.vault.slice(-4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Deposit Cap:</span>
                      <span className="font-semibold">{formatUnits(selectedProperty.depositCap, 18)} OFTUSDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Deposited:</span>
                      <span className="font-semibold">{formatUnits(selectedProperty.totalDeposited, 18)} OFTUSDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        selectedProperty.daoStage === 2
                          ? 'bg-green-100 text-green-800' 
                          : selectedProperty.daoStage === 1
                          ? 'bg-blue-100 text-blue-800'
                          : selectedProperty.daoStage === 0
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedProperty.daoStage === 2 ? 'Under Management' : 
                         selectedProperty.daoStage === 1 ? 'Funded' : 
                         selectedProperty.daoStage === 0 ? 'Open to Fund' : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Created:</span>
                      <span className="text-sm">{new Date(Number(selectedProperty.createdAt) * 1000).toLocaleDateString()}</span>
                    </div>
                    {selectedProperty.daoAddress && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">DAO Address:</span>
                        <span className="font-mono text-xs">{selectedProperty.daoAddress.slice(0, 6)}...{selectedProperty.daoAddress.slice(-4)}</span>
                      </div>
                    )}
                    {selectedProperty.propertyAddress && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Property Address:</span>
                        <span className="text-sm">{selectedProperty.propertyAddress}</span>
                      </div>
                    )}
                    {selectedProperty.propertyTokenAddress && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Property Token:</span>
                        <span className="font-mono text-xs">{selectedProperty.propertyTokenAddress.slice(0, 6)}...{selectedProperty.propertyTokenAddress.slice(-4)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Rent Harvested:</span>
                      <span className="font-semibold">{formatUnits(selectedProperty.totalRentHarvested, 18)} OFTUSDC</span>
                    </div>
                  </div>
                </div>

                <div className="bg-accent rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Funding Progress</h3>
                  <div className="space-y-4">
                    {/* Vault Funding */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium flex items-center">
                          <Building2 className="h-4 w-4 mr-1" />
                          Vault Funding
                        </span>
                        <span className="font-semibold">{selectedProperty.vaultFundingProgress.toFixed(2)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className={`h-3 rounded-full transition-all duration-300 ${
                            selectedProperty.vaultIsFunded ? 'bg-blue-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(selectedProperty.vaultFundingProgress, 100)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground mt-1">
                        <span>{formatUnits(selectedProperty.totalDeposited, 18)} OFTUSDC</span>
                        <span>{formatUnits(selectedProperty.depositCap, 18)} OFTUSDC</span>
                      </div>
                    </div>
                    
                    {/* DAO Funding */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium flex items-center">
                          <Vote className="h-4 w-4 mr-1" />
                          DAO Funding
                        </span>
                        <span className="font-semibold">{selectedProperty.daoFundingProgress.toFixed(2)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className={`h-3 rounded-full transition-all duration-300 ${
                            selectedProperty.daoIsFullyFunded ? 'bg-purple-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${Math.min(selectedProperty.daoFundingProgress, 100)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground mt-1">
                        <span>{formatUnits(selectedProperty.daoInvested, 18)} OFTUSDC</span>
                        <span>{formatUnits(selectedProperty.daoFundingTarget, 18)} OFTUSDC</span>
                      </div>
                      {selectedProperty.daoIsFullyFunded && (
                        <div className="flex items-center text-green-600 text-sm mt-2">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Ready for purchase proposals
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Proposals Section */}
              <div className="bg-accent rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold flex items-center">
                    <Vote className="mr-2 h-5 w-5" />
                    Proposals ({propertyProposals.length})
                    {proposalExecutable && (
                      <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                        Executable Available
                      </span>
                    )}
                  </h3>
                  {selectedProperty.daoIsFullyFunded && (
                    <div className="flex items-center text-blue-600 text-sm">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Auto-created when DAO funded
                    </div>
                  )}
                </div>

                {loadingProposals ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : propertyProposals.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No proposals found for this property</p>
                    {selectedProperty.daoIsFullyFunded ? (
                      <p className="text-sm text-muted-foreground mt-2">
                        Purchase proposal should be automatically created when DAO funding target is reached
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">
                        Proposals will be automatically created when the property reaches its DAO funding target
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {propertyProposals.map((proposal) => (
                      <div key={proposal.id} className="bg-background rounded-lg p-4 border">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">Proposal #{proposal.id}</h4>
                              <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                Auto-Created
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{proposal.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              proposal.status === 'Active' 
                                ? 'bg-green-100 text-green-800'
                                : proposal.executed
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {proposal.status}
                            </span>
                            {proposal.canExecute && (
                              <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                Executable
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div>
                            <span className="text-muted-foreground">Proposer:</span>
                            <p className="font-mono text-xs">
                              {proposal.proposer 
                                ? `${proposal.proposer.slice(0, 6)}...${proposal.proposer.slice(-4)}`
                                : 'N/A'
                              }
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Deadline:</span>
                            <p className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {proposal.deadline 
                                ? new Date(Number(proposal.deadline) * 1000).toLocaleDateString()
                                : 'N/A'
                              }
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Votes For:</span>
                            <p className="font-semibold text-green-600">
                              {proposal.votesFor ? formatUnits(proposal.votesFor, 18) : '0'}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Votes Against:</span>
                            <p className="font-semibold text-red-600">
                              {proposal.votesAgainst ? formatUnits(proposal.votesAgainst, 18) : '0'}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-3 border-t">
                          <div className="flex items-center space-x-2">
                            {proposal.canExecute && (
                              <button
                                onClick={() => handleExecuteProposal(proposal.id, selectedProperty?.daoAddress || '')}
                                disabled={loading}
                                className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm hover:bg-green-200 disabled:opacity-50 flex items-center"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Execute Proposal
                              </button>
                            )}
                            {proposal.executed && selectedProperty?.daoStage === 1 && (
                              <button
                                onClick={() => handleCompletePropertyPurchase(selectedProperty?.daoAddress || '')}
                                disabled={loading}
                                className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm hover:bg-blue-200 disabled:opacity-50 flex items-center"
                              >
                                <Building2 className="h-3 w-3 mr-1" />
                                Complete Purchase
                              </button>
                            )}
                          </div>
                          
                          {/* Status Indicators */}
                          <div className="flex items-center space-x-2">
                            {proposal.canExecute && (
                              <div className="flex items-center text-sm text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                <span>Ready to execute</span>
                              </div>
                            )}
                            {proposal.status === 'Active' && !proposal.canExecute && (
                              <div className="flex items-center text-sm text-muted-foreground">
                                <Clock className="h-3 w-3 mr-1" />
                                <span>Active - Use Hardhat console to skip time</span>
                              </div>
                            )}
                            {proposal.executed && selectedProperty?.daoStage === 1 && (
                              <div className="flex items-center text-sm text-blue-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                <span>Ready to complete purchase</span>
                              </div>
                            )}
                            {selectedProperty?.daoStage === 2 && (
                              <div className="flex items-center text-sm text-green-600">
                                <Building2 className="h-3 w-3 mr-1" />
                                <span>Property purchased</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Property Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Create New Property</h2>
                <button
                  onClick={resetCreationFlow}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Step Progress Indicator */}
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="flex items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                        step === creationStep
                          ? 'bg-primary text-white shadow-lg scale-110'
                          : step < creationStep
                          ? 'bg-green-500 text-white shadow-md'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {step < creationStep ? <CheckCircle2 className="h-5 w-5" /> : 
                         step === creationStep && isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : step}
                      </div>
                      <div className="ml-3 text-sm font-medium">
                        {step === 1 && 'Create Property'}
                        {step === 2 && 'Deploy DAO'}
                        {step === 3 && 'Link DAO'}
                        {step === 4 && 'Set Funding'}
                      </div>
                      {step < 4 && (
                        <div className={`w-16 h-1 mx-4 rounded-full transition-all duration-500 ${
                          step < creationStep ? 'bg-green-500' : 'bg-gray-200'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Progress Bar */}
                {isCreating && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2">
                      <span>Progress</span>
                      <span>{creationProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${creationProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Transaction Status */}
              {currentTxHash && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {txStatus === 'pending' && <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />}
                      {txStatus === 'confirmed' && <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" />}
                      {txStatus === 'error' && <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />}
                      <div>
                        <p className="font-medium text-blue-800">
                          {txStatus === 'pending' && 'Transaction Pending...'}
                          {txStatus === 'confirmed' && 'Transaction Confirmed!'}
                          {txStatus === 'error' && 'Transaction Failed'}
                        </p>
                        <p className="text-sm text-blue-600 font-mono">
                          {currentTxHash.slice(0, 10)}...{currentTxHash.slice(-8)}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(currentTxHash)}
                        className="p-1 hover:bg-blue-100 rounded"
                        title="Copy transaction hash"
                      >
                        <Copy className="h-4 w-4 text-blue-600" />
                      </button>
                      <a
                        href={`https://localhost:8545/tx/${currentTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 hover:bg-blue-100 rounded"
                        title="View on block explorer"
                      >
                        <ExternalLink className="h-4 w-4 text-blue-600" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Create Property */}
              {creationStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-blue-800 mb-2">Step 1: Create Property</h3>
                    <p className="text-blue-700 text-sm">
                      This will create a PropertyVaultGovernance via PropertyRegistry (which uses VaultFactory internally).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Property Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      placeholder="e.g., Miami Luxury Condo"
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                      required
                    />
                    {!propertyName && (
                      <p className="text-sm text-red-500 mt-1">Property name is required</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Deposit Cap (OFTUSDC) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={depositCap}
                        onChange={(e) => setDepositCap(e.target.value)}
                        placeholder="1000000"
                        min="1"
                        step="1"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 pr-12"
                        required
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                        OFTUSDC
                      </div>
                    </div>
                    {depositCap && Number(depositCap) > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        ≈ ${(Number(depositCap) * 1).toLocaleString()} USD
                      </p>
                    )}
                    {!depositCap && (
                      <p className="text-sm text-red-500 mt-1">Deposit cap is required</p>
                    )}
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={resetCreationFlow}
                      disabled={isCreating}
                      className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateProperty}
                      disabled={isCreating || !propertyName || !depositCap || Number(depositCap) <= 0}
                      className="px-8 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="h-4 w-4" />
                          <span>Create Property</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Deploy DAO */}
              {creationStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-green-800 mb-2">Step 1 Complete: Property Created</h3>
                    <div className="text-sm text-green-700">
                      <p><strong>Property ID:</strong> {createdPropertyId}</p>
                      <p><strong>Vault Address:</strong> {createdVaultAddress?.slice(0, 6)}...{createdVaultAddress?.slice(-4)}</p>
                    </div>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-orange-800 mb-2">Step 2: Deploy PropertyDAO</h3>
                    <p className="text-orange-700 text-sm">
                      Deploy a PropertyDAO contract that will manage the property's funding and governance.
                    </p>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setCreationStep(1)}
                      disabled={isCreating}
                      className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleDeployDAO}
                      disabled={isCreating}
                      className="px-8 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Deploying...</span>
                        </>
                      ) : (
                        <>
                          <Vote className="h-4 w-4" />
                          <span>Deploy DAO</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  {/* Manual vault address input if event parsing failed */}
                  {createdVaultAddress === '0x0000000000000000000000000000000000000000' && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-yellow-800 text-sm mb-3">
                        <strong>Note:</strong> Could not automatically detect the vault address. 
                        Please enter the vault address manually from your transaction receipt.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">Vault Address</label>
                          <input
                            type="text"
                            value={manualVaultAddress}
                            onChange={(e) => setManualVaultAddress(e.target.value)}
                            placeholder="0x..."
                            className="w-full p-2 border rounded text-sm"
                          />
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              if (manualVaultAddress) {
                                setCreatedVaultAddress(manualVaultAddress)
                                setCreationStep(3)
                              }
                            }}
                            disabled={!manualVaultAddress}
                            className="px-4 py-2 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
                          >
                            Use This Address
                          </button>
                          <button
                            onClick={() => setCreationStep(3)}
                            className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                          >
                            Skip for Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Link DAO */}
              {creationStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-green-800 mb-2">Step 2 Complete: DAO Deployed</h3>
                    <div className="text-sm text-green-700">
                      <p><strong>DAO Address:</strong> {createdDAOAddress?.slice(0, 6)}...{createdDAOAddress?.slice(-4)}</p>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-purple-800 mb-2">Step 3: Link DAO to Vault</h3>
                    <p className="text-purple-700 text-sm">
                      Link the PropertyDAO to the PropertyVaultGovernance so they can work together.
                    </p>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setCreationStep(2)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleLinkDAO}
                      disabled={isCreating}
                      className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCreating ? 'Linking...' : 'Link DAO'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Set Funding Target */}
              {creationStep === 4 && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-green-800 mb-2">Step 3 Complete: DAO Linked</h3>
                    <p className="text-green-700 text-sm">
                      The PropertyDAO is now linked to the PropertyVaultGovernance.
                    </p>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-indigo-800 mb-2">Step 4: Set Funding Target</h3>
                    <p className="text-indigo-700 text-sm">
                      Set the funding target and deadline for the property's DAO.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Funding Target (OFTUSDC) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={fundingTarget}
                        onChange={(e) => setFundingTarget(e.target.value)}
                        placeholder="500000"
                        min="1"
                        step="1"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 pr-12"
                        required
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                        OFTUSDC
                      </div>
                    </div>
                    {fundingTarget && Number(fundingTarget) > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        ≈ ${(Number(fundingTarget) * 1).toLocaleString()} USD
                      </p>
                    )}
                    {!fundingTarget && (
                      <p className="text-sm text-red-500 mt-1">Funding target is required</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Funding Deadline <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={fundingDeadline}
                      onChange={(e) => setFundingDeadline(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                      required
                    />
                    {fundingDeadline && new Date(fundingDeadline) <= new Date() && (
                      <p className="text-sm text-red-500 mt-1">Deadline must be in the future</p>
                    )}
                    {!fundingDeadline && (
                      <p className="text-sm text-red-500 mt-1">Funding deadline is required</p>
                    )}
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setCreationStep(3)}
                      disabled={isCreating}
                      className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSetFundingTarget}
                      disabled={isCreating || !fundingTarget || !fundingDeadline || Number(fundingTarget) <= 0 || new Date(fundingDeadline) <= new Date()}
                      className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Setting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Complete Setup</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Property Management Modal */}
      {showManagementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Property Management</h2>
                <button
                  onClick={() => setShowManagementModal(false)}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Rent Management */}
                <div className="bg-accent rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <DollarSign className="h-5 w-5 mr-2" />
                    Rent Management
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Harvest rent income from properties and distribute to investors.
                  </p>
                  <div className="space-y-3">
                    {properties.filter(p => p.daoStage >= 2).map((property) => (
                      <div key={property.id} className="flex items-center justify-between p-3 bg-background rounded border">
                        <div>
                          <p className="font-medium">{property.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Total Rent: {formatUnits(property.totalRentHarvested, 18)} OFTUSDC
                          </p>
                        </div>
                        <button
                          onClick={() => handleOpenRentModal(property)}
                          disabled={loading}
                          className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm hover:bg-green-200 disabled:opacity-50"
                        >
                          Harvest Rent
                        </button>
                      </div>
                    ))}
                    {properties.filter(p => p.daoStage >= 2).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No properties under management yet
                      </p>
                    )}
                  </div>
                </div>

                {/* NAV Updates */}
                <div className="bg-accent rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    NAV Updates
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Update property values to reflect appreciation or depreciation.
                  </p>
                  <div className="space-y-3">
                    {properties.filter(p => p.daoStage >= 2).map((property) => (
                      <div key={property.id} className="flex items-center justify-between p-3 bg-background rounded border">
                        <div>
                          <p className="font-medium">{property.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Property Token: {property.propertyTokenAddress ? 
                              `${property.propertyTokenAddress.slice(0, 6)}...${property.propertyTokenAddress.slice(-4)}` : 
                              'Not created'
                            }
                          </p>
                        </div>
                        <button
                          onClick={() => handleOpenNavModal(property)}
                          disabled={loading || !property.propertyTokenAddress}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm hover:bg-blue-200 disabled:opacity-50"
                        >
                          Update NAV
                        </button>
                      </div>
                    ))}
                    {properties.filter(p => p.daoStage >= 2).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No properties under management yet
                      </p>
                    )}
                  </div>
                </div>

                {/* Execute Purchase Flow */}
                <div className="bg-accent rounded-lg p-4 md:col-span-2">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <Vote className="h-5 w-5 mr-2" />
                    Execute Purchase Flow
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Complete the property purchase workflow: Execute proposals → Complete purchases → Manage properties.
                  </p>
                  
                  {/* Step-by-step flow */}
                  <div className="space-y-4">
                    {/* Step 1: Execute Proposals */}
                    <div className="bg-background rounded border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-semibold mr-3">
                            1
                          </div>
                          <h4 className="font-medium">Execute Purchase Proposals</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">Use Hardhat console to skip time</span>
                      </div>
                      <div className="space-y-2">
                        {properties.filter(p => p.daoAddress && p.daoStage === 1).map((property) => (
                          <div key={property.id} className="flex items-center justify-between p-2 bg-accent rounded">
                            <div className="flex items-center">
                              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span className="text-sm font-medium">{property.name}</span>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleExecuteProposal(1, property.daoAddress!)}
                                disabled={loading}
                                className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs hover:bg-green-200 disabled:opacity-50 flex items-center"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Execute
                              </button>
                            </div>
                          </div>
                        ))}
                        {properties.filter(p => p.daoAddress && p.daoStage === 1).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No properties ready for proposal execution
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Complete Purchases */}
                    <div className="bg-background rounded border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-xs font-semibold mr-3">
                            2
                          </div>
                          <h4 className="font-medium">Complete Property Purchases</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">After proposal execution</span>
                      </div>
                      <div className="space-y-2">
                        {properties.filter(p => p.daoAddress && p.daoStage === 1).map((property) => (
                          <div key={property.id} className="flex items-center justify-between p-2 bg-accent rounded">
                            <div className="flex items-center">
                              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span className="text-sm font-medium">{property.name}</span>
                            </div>
                            <button
                              onClick={() => handleCompletePropertyPurchase(property.daoAddress!)}
                              disabled={loading}
                              className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 disabled:opacity-50 flex items-center"
                            >
                              <Building2 className="h-3 w-3 mr-1" />
                              Complete Purchase
                            </button>
                          </div>
                        ))}
                        {properties.filter(p => p.daoAddress && p.daoStage === 1).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No properties ready for purchase completion
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Step 3: Under Management */}
                    <div className="bg-background rounded border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-purple-100 text-purple-800 rounded-full flex items-center justify-center text-xs font-semibold mr-3">
                            3
                          </div>
                          <h4 className="font-medium">Properties Under Management</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">Ready for rent & NAV</span>
                      </div>
                      <div className="space-y-2">
                        {properties.filter(p => p.daoStage === 2).map((property) => (
                          <div key={property.id} className="flex items-center justify-between p-2 bg-accent rounded">
                            <div className="flex items-center">
                              <Building2 className="h-4 w-4 mr-2 text-green-600" />
                              <span className="text-sm font-medium">{property.name}</span>
                              {property.propertyAddress && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({property.propertyAddress})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                Under Management
                              </span>
                              <button
                                onClick={() => handleOpenRentModal(property)}
                                disabled={loading}
                                className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs hover:bg-green-200 disabled:opacity-50"
                              >
                                Harvest Rent
                              </button>
                              <button
                                onClick={() => handleOpenNavModal(property)}
                                disabled={loading}
                                className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 disabled:opacity-50"
                              >
                                Update NAV
                              </button>
                            </div>
                          </div>
                        ))}
                        {properties.filter(p => p.daoStage === 2).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No properties under management yet
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rent Harvest Modal */}
      {showRentModal && selectedPropertyForRent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                  Harvest Rent
                </h2>
                <button
                  onClick={() => {
                    setShowRentModal(false)
                    setSelectedPropertyForRent(null)
                    setRentHarvestAmount('')
                  }}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-accent rounded-lg p-4">
                  <h3 className="font-medium mb-2">{selectedPropertyForRent.name}</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Vault: {selectedPropertyForRent.vault.slice(0, 6)}...{selectedPropertyForRent.vault.slice(-4)}</p>
                    <p>Current Rent Harvested: {formatUnits(selectedPropertyForRent.totalRentHarvested, 18)} OFTUSDC</p>
                    {selectedPropertyForRent.propertyAddress && (
                      <p>Property: {selectedPropertyForRent.propertyAddress}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Rent Amount (OFTUSDC) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={rentHarvestAmount}
                      onChange={(e) => setRentHarvestAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 pr-12"
                      required
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                      OFTUSDC
                    </div>
                  </div>
                  {rentHarvestAmount && Number(rentHarvestAmount) > 0 && (
                    <p className="text-sm text-green-600 mt-1">
                      ≈ ${(Number(rentHarvestAmount) * 1).toLocaleString()} USD
                    </p>
                  )}
                  {rentHarvestAmount && (isNaN(Number(rentHarvestAmount)) || Number(rentHarvestAmount) <= 0) && (
                    <p className="text-sm text-red-500 mt-1">Please enter a valid amount</p>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <AlertTriangle className="h-4 w-4 text-blue-600 mr-2 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">Important:</p>
                      <p>You need OFTUSDC tokens in your wallet. First approve the vault to spend your tokens, then harvest rent to transfer them to the vault as income.</p>
                    </div>
                  </div>
                </div>

                {/* Status indicator */}
                {rentStep !== 'idle' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      {rentStep === 'approving' && (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm text-blue-800">
                            {isPending ? 'Step 1: Approving OFTUSDC... Please confirm the transaction in your wallet.' :
                             isRentApprovalConfirming ? 'Step 1: Waiting for approval confirmation on-chain...' :
                             'Step 1: Approving OFTUSDC...'}
                          </span>
                        </>
                      )}
                      {rentStep === 'approved' && (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-800">Step 1 Complete: OFTUSDC approved! Now harvesting rent...</span>
                        </>
                      )}
                      {rentStep === 'harvesting' && (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="text-sm text-blue-800">Step 2: Harvesting rent... Please confirm the transaction in your wallet.</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowRentModal(false)
                      setSelectedPropertyForRent(null)
                      setRentHarvestAmount('')
                      setRentApprovalStatus('none')
                      setRentStep('idle')
                      setRentApprovalHash(undefined)
                    }}
                    disabled={isPending || isRentApprovalConfirming}
                    className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  
                  <button
                    onClick={approveAndHarvestRent}
                    disabled={isPending || isRentApprovalConfirming || !rentHarvestAmount || isNaN(Number(rentHarvestAmount)) || Number(rentHarvestAmount) <= 0}
                    className="px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-all duration-200 font-semibold"
                  >
                    {rentStep === 'approving' && isPending ? 'Approving OFTUSDC...' :
                     rentStep === 'approved' && isPending ? 'Harvesting Rent...' :
                     isPending ? 'Processing...' :
                     'Approve & Harvest Rent'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NAV Update Modal */}
      {showNavModal && selectedPropertyForNav && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
                  Update NAV
                </h2>
                <button
                  onClick={() => {
                    setShowNavModal(false)
                    setSelectedPropertyForNav(null)
                    setNavUpdateValue('')
                  }}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-accent rounded-lg p-4">
                  <h3 className="font-medium mb-2">{selectedPropertyForNav.name}</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Vault: {selectedPropertyForNav.vault.slice(0, 6)}...{selectedPropertyForNav.vault.slice(-4)}</p>
                    {selectedPropertyForNav.propertyTokenAddress && (
                      <p>Property Token: {selectedPropertyForNav.propertyTokenAddress.slice(0, 6)}...{selectedPropertyForNav.propertyTokenAddress.slice(-4)}</p>
                    )}
                    {selectedPropertyForNav.propertyAddress && (
                      <p>Property: {selectedPropertyForNav.propertyAddress}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    NAV Change (OFTUSDC) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={navUpdateValue}
                      onChange={(e) => setNavUpdateValue(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 pr-12"
                      required
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                      OFTUSDC
                    </div>
                  </div>
                  {navUpdateValue && !isNaN(Number(navUpdateValue)) && (
                    <p className="text-sm text-blue-600 mt-1">
                      {Number(navUpdateValue) >= 0 ? '+' : ''}${(Number(navUpdateValue) * 1).toLocaleString()} USD
                    </p>
                  )}
                  {navUpdateValue && isNaN(Number(navUpdateValue)) && (
                    <p className="text-sm text-red-500 mt-1">Please enter a valid number</p>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mr-2 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">NAV Update:</p>
                      <p>Positive values increase property value (appreciation), negative values decrease it (depreciation). This affects the PropertyToken's totalSupply.</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowNavModal(false)
                      setSelectedPropertyForNav(null)
                      setNavUpdateValue('')
                    }}
                    disabled={isUpdatingNav}
                    className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateNAV}
                    disabled={isUpdatingNav || !navUpdateValue || isNaN(Number(navUpdateValue))}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                  >
                    {isUpdatingNav ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4" />
                        <span>Update NAV</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
