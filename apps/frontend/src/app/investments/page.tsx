'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { Building2, Users, DollarSign, Vote, Clock, CheckCircle, AlertTriangle, Eye, MapPin, Calendar, TrendingUp, Loader2, ExternalLink, Copy, CheckCircle2, X, RefreshCw, Info, CheckCircle as CheckIcon, XCircle, AlertCircle, Coins } from 'lucide-react'
import { PROPERTY_REGISTRY_ABI, PROPERTY_VAULT_GOVERNANCE_ABI, PROPERTY_DAO_ABI, OFT_USDC_ABI } from '@brickvault/abi'
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../../config/contracts'
import { Header } from '@/components/Header'
import { formatUnits, parseUnits } from 'viem'

interface UserInvestment {
  propertyId: number
  propertyName: string
  vaultAddress: string
  daoAddress: string
  shares: bigint
  votingPower: bigint
  totalShares: bigint
  sharePercentage: number
  daoStage: number
  // Property token information
  propertyTokenAddress?: string
  propertyTokenTotalSupply?: bigint
  // Proposal information
  proposals: Proposal[]
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
  data: string // Encoded proposal data
  userVote?: {
    hasVoted: boolean
    support: boolean
    weight: bigint
  }
}

export default function InvestmentsPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [userInvestments, setUserInvestments] = useState<UserInvestment[]>([])
  const [fetchingInvestments, setFetchingInvestments] = useState(false)
  const [investmentsError, setInvestmentsError] = useState<string | null>(null)
  
  // Voting state
  const [votingProposal, setVotingProposal] = useState<{ propertyId: number; proposalId: number } | null>(null)
  const [votingSupport, setVotingSupport] = useState<boolean | null>(null)
  
  // Property detail modal state
  const [selectedInvestment, setSelectedInvestment] = useState<UserInvestment | null>(null)
  const [showInvestmentModal, setShowInvestmentModal] = useState(false)

  // Rent withdrawal state
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [maxWithdrawable, setMaxWithdrawable] = useState<bigint>(BigInt(0))
  const [withdrawalStep, setWithdrawalStep] = useState<'idle' | 'withdrawing' | 'confirming' | 'success' | 'error'>('idle')
  const [withdrawalHash, setWithdrawalHash] = useState<string | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  
  // Redeem state for liquidated properties
  const [redeemSharesAmount, setRedeemSharesAmount] = useState('')

  // Proposal creation state
  const [showCreateProposalModal, setShowCreateProposalModal] = useState(false)
  const [selectedPropertyForProposal, setSelectedPropertyForProposal] = useState<UserInvestment | null>(null)
  const [proposalType, setProposalType] = useState<string>('0') // Default to Property Liquidation
  const [proposalDescription, setProposalDescription] = useState('')
  const [proposalData, setProposalData] = useState('')
  const [isCreatingProposal, setIsCreatingProposal] = useState(false)
  const [proposalCreationStep, setProposalCreationStep] = useState<'idle' | 'creating' | 'success' | 'error'>('idle')

  const registryAddress = CONTRACT_ADDRESSES.PropertyRegistry
  const { writeContract, writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  
  // Get expected chain ID from config
  const expectedChainId = NETWORK_CONFIG.chainId

  // Withdrawal transaction tracking
  const { data: withdrawalTxReceipt, isSuccess: isWithdrawalConfirmed, isError: isWithdrawalError } = useWaitForTransactionReceipt({
    hash: withdrawalHash as `0x${string}`,
    query: {
      enabled: !!withdrawalHash && withdrawalStep === 'confirming',
    },
  })

  // Get property count
  const { data: propertyCount, refetch: refetchPropertyCount } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getPropertyCount',
    query: {
      enabled: !!registryAddress && isConnected && chainId === expectedChainId,
    },
  })

  // Fetch user's investments
  const fetchUserInvestments = async (showLoading = true) => {
    if (!publicClient || !address) {
      setInvestmentsError('No blockchain connection or wallet address available')
      return
    }

    if (!propertyCount || propertyCount === 0) {
      setUserInvestments([])
      setInvestmentsError(null)
      return
    }

    if (showLoading) {
      setFetchingInvestments(true)
    }
    setInvestmentsError(null)

    const investments: UserInvestment[] = []
    const totalCount = Number(propertyCount as bigint)
    
    
    // Check each property for user investments
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
          const property = propertyData as { name: string; vault: string; depositCap: bigint; totalDeposited: bigint; status: number; createdAt: bigint }
          
          // Check if user has shares in this vault
          const userShares = await publicClient.readContract({
            address: property.vault as `0x${string}`,
            abi: PROPERTY_VAULT_GOVERNANCE_ABI,
            functionName: 'balanceOf',
            args: [address],
          }) as bigint

          // Only include properties where user has shares
          if (userShares > 0) {
            
            // Get total shares for percentage calculation
            const totalShares = await publicClient.readContract({
              address: property.vault as `0x${string}`,
              abi: PROPERTY_VAULT_GOVERNANCE_ABI,
              functionName: 'totalSupply',
            }) as bigint

            const sharePercentage = totalShares > 0 ? Number((userShares * BigInt(10000)) / totalShares) / 100 : 0

            // Get property name from vault
            let propertyName = property.name || `Property #${i}`
            try {
              const vaultName = await publicClient.readContract({
                address: property.vault as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'name',
              }) as string
              propertyName = vaultName || propertyName
            } catch (error) {
              // Property name fetch failed, use fallback
            }

            // Get DAO address and stage
            let daoAddress = ''
            let daoStage = 0
            let votingPower = userShares

            try {
              const vaultDAO = await publicClient.readContract({
                address: property.vault as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'dao',
              }) as string
              
              if (vaultDAO && vaultDAO !== '0x0000000000000000000000000000000000000000') {
                daoAddress = vaultDAO
                
                // Get DAO stage
                const propertyInfo = await publicClient.readContract({
                  address: vaultDAO as `0x${string}`,
                  abi: PROPERTY_DAO_ABI,
                  functionName: 'propertyInfo',
                }) as any
                
                const [stage] = propertyInfo
                daoStage = Number(stage)
              }
            } catch (error) {
              // DAO info fetch failed, use defaults
            }

            // Get property token address and total supply if exists
            let propertyTokenAddress: string | undefined
            let propertyTokenTotalSupply: bigint | undefined

            try {
              const tokenAddress = await publicClient.readContract({
                address: property.vault as `0x${string}`,
                abi: PROPERTY_VAULT_GOVERNANCE_ABI,
                functionName: 'getPropertyToken',
              }) as string
              
              if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
                propertyTokenAddress = tokenAddress
                
                // Get total supply of the property token
                try {
                  const totalSupply = await publicClient.readContract({
                    address: tokenAddress as `0x${string}`,
                    abi: [
                      {
                        "inputs": [],
                        "name": "totalSupply",
                        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                        "stateMutability": "view",
                        "type": "function"
                      }
                    ],
                    functionName: 'totalSupply',
                  }) as bigint
                  propertyTokenTotalSupply = totalSupply
                } catch (error) {
                  // Total supply fetch failed
                }
              }
            } catch (error) {
              // Property token address not available
            }

            // Fetch proposals for this property
            const proposals = await fetchPropertyProposals(daoAddress, i)

            investments.push({
              propertyId: i,
              propertyName,
              vaultAddress: property.vault,
              daoAddress,
              shares: userShares,
              votingPower,
              totalShares,
              sharePercentage,
              daoStage,
              propertyTokenAddress,
              propertyTokenTotalSupply,
              proposals
            })
          }
        }
      } catch (error) {
        // Continue with other properties even if one fails
      }
    }

    setUserInvestments(investments)
    setFetchingInvestments(false)
    setInvestmentsError(null)
  }

  // Fetch max withdrawable amount for rent income
  const fetchMaxWithdrawable = async (vaultAddress: string) => {
    if (!publicClient || !address || !vaultAddress) {
      setMaxWithdrawable(BigInt(0))
      return
    }

    try {
      const maxWithdrawableAmount = await publicClient.readContract({
        address: vaultAddress as `0x${string}`,
        abi: PROPERTY_VAULT_GOVERNANCE_ABI,
        functionName: 'getMaxWithdrawable',
        args: [address],
      }) as bigint

      setMaxWithdrawable(maxWithdrawableAmount)
    } catch (error) {
      console.error('Error fetching max withdrawable:', error)
      setMaxWithdrawable(BigInt(0))
    }
  }

  // Fetch proposals for a specific property
  const fetchPropertyProposals = async (daoAddress: string, propertyId: number): Promise<Proposal[]> => {
    if (!publicClient || !daoAddress || daoAddress === '0x0000000000000000000000000000000000000000') {
      return []
    }

    try {
      // Get the current proposal count from PropertyDAO
      const proposalCount = await publicClient.readContract({
        address: daoAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'proposalCount',
      }) as bigint

      const proposals: Proposal[] = []
      
      // Fetch all proposals
      for (let i = 1; i <= Number(proposalCount); i++) {
        try {
          const proposal = await publicClient.readContract({
            address: daoAddress as `0x${string}`,
            abi: PROPERTY_DAO_ABI,
            functionName: 'proposals',
            args: [i],
          }) as any

          if (proposal) {
            // The proposal is returned as a struct array: [id, proposer, proposalType, description, deadline, votesFor, votesAgainst, executed, status, data]
            const [id, proposer, proposalType, description, deadline, votesFor, votesAgainst, executed, status, data] = proposal
            
            // Get user's vote for this proposal
            let userVote = undefined
            if (address) {
              try {
                const vote = await publicClient.readContract({
                  address: daoAddress as `0x${string}`,
                  abi: PROPERTY_DAO_ABI,
                  functionName: 'votes',
                  args: [i, address],
                }) as any
                
                // The vote struct is returned as an array: [hasVoted, support, weight]
                const [hasVoted, support, weight] = vote
                
                userVote = {
                  hasVoted: hasVoted || false,
                  support: support || false,
                  weight: weight || BigInt(0)
                }
              } catch (error) {
                // Vote fetch failed, userVote remains undefined
              }
            }
            
            const proposalData: Proposal = {
              id: Number(id),
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
              data: data || '0x',
              userVote
            }
            proposals.push(proposalData)
          }
        } catch (error) {
          // Skip this proposal if fetch fails
        }
      }
      
      return proposals
    } catch (error) {
      return []
    }
  }

  // Manual refresh function
  const refreshInvestments = async () => {
    try {
      // First refetch the property count from the contract
      await refetchPropertyCount()
      // Then fetch all user investments with the updated count
      await fetchUserInvestments(true)
    } catch (error) {
      console.error('Error refreshing investments:', error)
      setInvestmentsError('Failed to refresh investments')
    }
  }

  // Handle investment click to show details
  const handleInvestmentClick = async (investment: UserInvestment) => {
    setSelectedInvestment(investment)
    setShowInvestmentModal(true)
  }

  // Handle rent income withdrawal
  const handleWithdrawRent = async () => {
    if (!selectedInvestment || !address || !withdrawalAmount || maxWithdrawable === BigInt(0)) {
      alert('Please enter a valid withdrawal amount')
      return
    }

    const amount = parseUnits(withdrawalAmount, 18)
    if (amount > maxWithdrawable) {
      alert('Withdrawal amount exceeds maximum withdrawable amount')
      return
    }

    try {
      setIsWithdrawing(true)
      setWithdrawalStep('withdrawing')
      
      const hash = await writeContractAsync({
        address: selectedInvestment.vaultAddress as `0x${string}`,
        abi: PROPERTY_VAULT_GOVERNANCE_ABI,
        functionName: 'withdraw',
        args: [amount, address, address]
      })

      setWithdrawalHash(hash)
      setWithdrawalStep('confirming')
    } catch (error) {
      console.error('Withdrawal failed:', error)
      setWithdrawalStep('error')
      setIsWithdrawing(false)
      alert('Withdrawal failed. Please try again.')
    }
  }

  // Handle redeem for liquidated properties
  const handleRedeemShares = async () => {
    if (!selectedInvestment || !address || !redeemSharesAmount) {
      alert('Please enter a valid shares amount')
      return
    }

    const sharesAmount = parseUnits(redeemSharesAmount, 18)
    if (sharesAmount > selectedInvestment.shares) {
      alert('Redeem amount exceeds your shares')
      return
    }

    try {
      setIsWithdrawing(true)
      setWithdrawalStep('withdrawing')
      
      const hash = await writeContractAsync({
        address: selectedInvestment.vaultAddress as `0x${string}`,
        abi: PROPERTY_VAULT_GOVERNANCE_ABI,
        functionName: 'redeem',
        args: [sharesAmount, address, address]
      })

      setWithdrawalHash(hash)
      setWithdrawalStep('confirming')
    } catch (error) {
      console.error('Redeem failed:', error)
      setWithdrawalStep('error')
      setIsWithdrawing(false)
      alert('Redeem failed. Please try again.')
    }
  }

  // Close investment modal
  const closeInvestmentModal = () => {
    setShowInvestmentModal(false)
    setSelectedInvestment(null)
    // Reset withdrawal state
    setWithdrawalAmount('')
    setMaxWithdrawable(BigInt(0))
    setWithdrawalStep('idle')
    setWithdrawalHash(null)
    setIsWithdrawing(false)
    // Reset redeem state
    setRedeemSharesAmount('')
  }

  // Handle create proposal modal
  const handleOpenCreateProposalModal = (investment: UserInvestment) => {
    setSelectedPropertyForProposal(investment)
    setShowCreateProposalModal(true)
    // Reset form
    setProposalType('0')
    setProposalDescription('')
    setProposalData('')
    setProposalCreationStep('idle')
  }

  // Close create proposal modal
  const closeCreateProposalModal = () => {
    setShowCreateProposalModal(false)
    setSelectedPropertyForProposal(null)
    setProposalType('0')
    setProposalDescription('')
    setProposalData('')
    setProposalCreationStep('idle')
    setIsCreatingProposal(false)
  }

  // Handle proposal creation
  const handleCreateProposal = async () => {
    if (!selectedPropertyForProposal || !proposalDescription.trim()) {
      alert('Please fill in all required fields')
      return
    }

    if (!selectedPropertyForProposal.daoAddress) {
      alert('DAO address not found for this property')
      return
    }

    try {
      setIsCreatingProposal(true)
      setProposalCreationStep('creating')
      
      // Encode proposal data based on type
      let encodedData = '0x'
      if (proposalData.trim()) {
        switch (proposalType) {
          case '0': // PropertyLiquidation
            const liquidationPrice = parseUnits(proposalData.trim(), 18)
            encodedData = `0x${liquidationPrice.toString(16).padStart(64, '0')}`
            break
          case '2': // ThresholdUpdate
            const thresholdValue = parseUnits((parseFloat(proposalData.trim()) * 100).toString(), 18) // Convert percentage to basis points
            encodedData = `0x${thresholdValue.toString(16).padStart(64, '0')}`
            break
          default:
            // For other proposal types (3, 5, 6), use empty data
            encodedData = '0x'
            break
        }
      }

      const hash = await writeContractAsync({
        address: selectedPropertyForProposal.daoAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'createProposal',
        args: [
          Number(proposalType),
          proposalDescription,
          encodedData
        ]
      })
      
      setProposalCreationStep('success')
      
      // Show success message
      alert(`Proposal created successfully!\n\nProposal has been submitted and is now active for voting.`)
      
      // Refresh investments to show the new proposal
      await fetchUserInvestments(false)
      
      // Close modal after delay
      setTimeout(() => {
        closeCreateProposalModal()
      }, 3000)
      
    } catch (error) {
      console.error('Proposal creation failed:', error)
      setProposalCreationStep('error')
      alert('Failed to create proposal. Please try again.')
    } finally {
      setIsCreatingProposal(false)
    }
  }

  // Helper function to decode liquidation price from proposal data
  const decodeLiquidationPrice = (data: string): string | null => {
    if (!data || data === '0x' || data.length < 66) {
      return null
    }
    
    try {
      // Data is encoded as uint256 (32 bytes = 64 hex chars + 0x prefix)
      // Remove '0x' prefix and parse as BigInt
      const hexValue = data.startsWith('0x') ? data.slice(2) : data
      const liquidationPriceBigInt = BigInt('0x' + hexValue.slice(0, 64))
      
      // Convert from 18 decimals to readable format
      return formatUnits(liquidationPriceBigInt, 18)
    } catch (error) {
      console.error('Error decoding liquidation price:', error)
      return null
    }
  }

  // Handle voting on a proposal
  const handleVote = async (propertyId: number, proposalId: number, support: boolean) => {
    if (!address) return

    const investment = userInvestments.find(inv => inv.propertyId === propertyId)
    if (!investment || !investment.daoAddress) {
      alert('DAO address not found for this property')
      return
    }

    try {
      setLoading(true)
      setVotingProposal({ propertyId, proposalId })
      setVotingSupport(support)
      
      
      const hash = await writeContractAsync({
        address: investment.daoAddress as `0x${string}`,
        abi: PROPERTY_DAO_ABI,
        functionName: 'vote',
        args: [proposalId, support]
      })
      
      // Show success message
      const successMessage = `Successfully voted ${support ? 'YES' : 'NO'} on proposal #${proposalId}!\n\nYour vote has been recorded on-chain. The proposal data will refresh automatically.`
      alert(successMessage)
      
      // Refresh investments immediately and after a delay
      await fetchUserInvestments(false)
      
      // Also refresh the selected investment's proposals specifically
      if (selectedInvestment && selectedInvestment.propertyId === propertyId) {
        const updatedProposals = await fetchPropertyProposals(selectedInvestment.daoAddress, propertyId)
        const updatedInvestment = {
          ...selectedInvestment,
          proposals: updatedProposals
        }
        setSelectedInvestment(updatedInvestment)
      }
      
      // Refresh again after a longer delay to ensure blockchain state is updated
      setTimeout(async () => {
        await fetchUserInvestments(false)
        if (selectedInvestment && selectedInvestment.propertyId === propertyId) {
          const updatedProposals = await fetchPropertyProposals(selectedInvestment.daoAddress, propertyId)
          const updatedInvestment = {
            ...selectedInvestment,
            proposals: updatedProposals
          }
          setSelectedInvestment(updatedInvestment)
        }
      }, 3000)
    } catch (error) {
      alert('Failed to vote. Please try again.')
    } finally {
      setLoading(false)
      setVotingProposal(null)
      setVotingSupport(null)
    }
  }

  // Check if current user is owner and handle network switching
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-switch to expected network if on wrong network
  useEffect(() => {
    if (mounted && isConnected && chainId !== expectedChainId) {
      try {
        switchChain({ chainId: expectedChainId })
      } catch (error) {
        console.error('Failed to switch chain:', error)
      }
    }
  }, [mounted, isConnected, chainId, switchChain, expectedChainId])

  // Fetch investments when propertyCount changes
  useEffect(() => {
    if (mounted && propertyCount !== undefined && publicClient && address) {
      fetchUserInvestments(false) // Don't show loading on initial fetch
    }
  }, [mounted, propertyCount, publicClient, address])

  // Fetch max withdrawable when investment is selected
  useEffect(() => {
    if (selectedInvestment && selectedInvestment.vaultAddress) {
      fetchMaxWithdrawable(selectedInvestment.vaultAddress)
    }
  }, [selectedInvestment, address, publicClient])

  // Track withdrawal transaction confirmation
  useEffect(() => {
    if (isWithdrawalConfirmed && withdrawalStep === 'confirming') {
      setWithdrawalStep('success')
      setIsWithdrawing(false)
      
      // Refresh data after successful withdrawal
      if (selectedInvestment) {
        fetchMaxWithdrawable(selectedInvestment.vaultAddress)
        fetchUserInvestments(false)
      }
      
      // Reset form after a delay
      setTimeout(() => {
        setWithdrawalAmount('')
        setRedeemSharesAmount('')
        setWithdrawalStep('idle')
        setWithdrawalHash(null)
      }, 3000)
    }
  }, [isWithdrawalConfirmed, withdrawalStep, selectedInvestment])

  // Track withdrawal transaction error
  useEffect(() => {
    if (isWithdrawalError && withdrawalStep === 'confirming') {
      setWithdrawalStep('error')
      setIsWithdrawing(false)
      setWithdrawalHash(null)
    }
  }, [isWithdrawalError, withdrawalStep])

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
          <p className="text-yellow-700 mt-2">Please connect your wallet to view your investments.</p>
        </div>
      </div>
    )
  }

  // Show network warning if not on expected network
  if (mounted && isConnected && chainId !== expectedChainId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
            <h2 className="text-lg font-semibold text-yellow-800">Wrong Network</h2>
          </div>
          <p className="text-yellow-700 mt-2">
            Please switch to {NETWORK_CONFIG.name} network (Chain ID: {expectedChainId}) to view your investments.
          </p>
          <div className="mt-4">
            <button
              onClick={() => switchChain({ chainId: expectedChainId })}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm"
            >
              Switch to {NETWORK_CONFIG.name}
            </button>
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
          <h1 className="text-3xl font-bold mb-2">My Investments</h1>
          <p className="text-muted-foreground">View and manage your property investments and voting rights</p>
        </div>

        {/* Network & Connection Status */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Account Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Network</p>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  chainId === expectedChainId ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <p className="font-semibold text-sm">
                  {chainId === expectedChainId ? `${NETWORK_CONFIG.name} (${expectedChainId})` : `Chain ID: ${chainId}`}
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
              <p className="text-sm text-muted-foreground">Wallet Address</p>
              <p className="font-mono text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
            </div>
          </div>
        </div>

        {/* Investment Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <p className="text-sm text-muted-foreground">Properties Invested</p>
                <p className="text-2xl font-bold">{userInvestments.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <p className="text-sm text-muted-foreground">Total Shares</p>
                <p className="text-2xl font-bold">
                  {formatUnits(
                    userInvestments.reduce((sum, inv) => sum + inv.shares, BigInt(0)), 
                    18
                  )}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center">
              <Vote className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <p className="text-sm text-muted-foreground">Active Proposals</p>
                <p className="text-2xl font-bold">
                  {userInvestments.reduce((sum, inv) => 
                    sum + inv.proposals.filter(p => p.status === 'Active').length, 0
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Investments List */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center">
              <Building2 className="mr-2 h-5 w-5" />
              My Property Investments
            </h2>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-muted-foreground">
                {userInvestments.length} investments
              </span>
              <button
                onClick={refreshInvestments}
                disabled={fetchingInvestments}
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
              >
                {fetchingInvestments ? (
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

          {/* Error State */}
          {investmentsError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Error Loading Investments</h3>
                  <p className="text-sm text-red-700 mt-1">{investmentsError}</p>
                </div>
              </div>
              <button
                onClick={refreshInvestments}
                className="mt-3 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-sm hover:bg-red-200 transition-colors flex items-center"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Try Again
              </button>
            </div>
          )}

          {/* Loading State */}
          {fetchingInvestments && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-blue-800">Loading Investments</h3>
                  <p className="text-sm text-blue-700 mt-1">Checking your property investments...</p>
                </div>
              </div>
            </div>
          )}

          {userInvestments.length === 0 && !fetchingInvestments ? (
            <div className="text-center py-8">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No investments found</p>
              <p className="text-sm text-muted-foreground mt-2">
                You haven't invested in any properties yet. Visit the Properties page to start investing.
              </p>
            </div>
          ) : userInvestments.length > 0 && (
            <div className="space-y-4">
              {userInvestments.map((investment) => (
                <div 
                  key={investment.propertyId} 
                  className="border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all duration-200 hover:border-primary"
                  onClick={() => handleInvestmentClick(investment)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg text-orange-600">{investment.propertyName}</h3>
                      <p className="text-sm text-muted-foreground flex items-center">
                        <MapPin className="mr-1 h-3 w-3" />
                        Property #{investment.propertyId}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center">
                        <Building2 className="mr-1 h-3 w-3" />
                        Vault: {investment.vaultAddress.slice(0, 6)}...{investment.vaultAddress.slice(-4)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span                       className={`px-2 py-1 rounded-full text-xs ${
                        investment.daoStage === 4
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : investment.daoStage === 3
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : investment.daoStage === 2
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : investment.daoStage === 1
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : investment.daoStage === 0
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      }`}>
                        {investment.daoStage === 4 ? 'Liquidated' :
                         investment.daoStage === 3 ? 'Liquidating' :
                         investment.daoStage === 2 ? 'Under Management' : 
                         investment.daoStage === 1 ? 'Funded' : 
                         investment.daoStage === 0 ? 'Open to Fund' : 'Unknown'}
                      </span>
                      {investment.proposals.filter(p => p.status === 'Active').length > 0 && (
                        <span className="px-2 py-1 rounded-full text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center">
                          <Vote className="h-3 w-3 mr-1" />
                          {investment.proposals.filter(p => p.status === 'Active').length} Active Proposals
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Investment Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center">
                      <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Your Shares</p>
                        <p className="font-semibold">{formatUnits(investment.shares, 18)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <TrendingUp className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Share Percentage</p>
                        <p className="font-semibold">{investment.sharePercentage.toFixed(2)}%</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <Vote className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Voting Power</p>
                        <p className="font-semibold">{formatUnits(investment.votingPower, 18)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Actions</p>
                        <div className="flex space-x-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleInvestmentClick(investment)
                            }}
                            className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded hover:bg-blue-200"
                          >
                            <Eye className="h-3 w-3 inline mr-1" />
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Investment Detail Modal */}
        {showInvestmentModal && selectedInvestment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-3xl font-bold text-orange-600">{selectedInvestment.propertyName} Investment</h2>
                  <button
                    onClick={closeInvestmentModal}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Investment Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-accent rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Your Investment</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Property ID:</span>
                        <span className="font-semibold">#{selectedInvestment.propertyId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Your Shares:</span>
                        <span className="font-semibold">{formatUnits(selectedInvestment.shares, 18)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Share Percentage:</span>
                        <span className="font-semibold">{selectedInvestment.sharePercentage.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Voting Power:</span>
                        <span className="font-semibold">{formatUnits(selectedInvestment.votingPower, 18)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total Shares:</span>
                        <span className="font-semibold">{formatUnits(selectedInvestment.totalShares, 18)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Vault Address:</span>
                        <span className="font-mono text-xs">{selectedInvestment.vaultAddress.slice(0, 6)}...{selectedInvestment.vaultAddress.slice(-4)}</span>
                      </div>
                      {selectedInvestment.daoAddress && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">DAO Address:</span>
                          <span className="font-mono text-xs">{selectedInvestment.daoAddress.slice(0, 6)}...{selectedInvestment.daoAddress.slice(-4)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-accent rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Property Status</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Current Stage</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            selectedInvestment.daoStage === 4
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : selectedInvestment.daoStage === 3
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                              : selectedInvestment.daoStage === 2
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                              : selectedInvestment.daoStage === 1
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : selectedInvestment.daoStage === 0
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                              : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          }`}>
                            {selectedInvestment.daoStage === 4 ? 'Liquidated' :
                             selectedInvestment.daoStage === 3 ? 'Liquidating' :
                             selectedInvestment.daoStage === 2 ? 'Under Management' : 
                             selectedInvestment.daoStage === 1 ? 'Funded' : 
                             selectedInvestment.daoStage === 0 ? 'Open to Fund' : 'Unknown'}
                          </span>
                        </div>
                      </div>

                      {/* Property Token Status */}
                      {selectedInvestment.propertyTokenAddress && (
                        <div className="border-t pt-4">
                          <div className="flex items-center mb-3">
                            <Coins className="h-4 w-4 mr-2 text-purple-600" />
                            <span className="text-sm font-medium">Property Token</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Token Address:</span>
                              <span className="font-mono text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-1 rounded">
                                {selectedInvestment.propertyTokenAddress.slice(0, 6)}...{selectedInvestment.propertyTokenAddress.slice(-4)}
                              </span>
                            </div>
                            {selectedInvestment.propertyTokenTotalSupply !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-sm text-muted-foreground">Total Supply (NAV):</span>
                                <span className="font-semibold text-purple-800">
                                  {formatUnits(selectedInvestment.propertyTokenTotalSupply, 18)} PROP
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <div className="flex items-start">
                              <Coins className="h-4 w-4 text-purple-600 mr-2 mt-0.5" />
                              <div className="text-sm text-purple-800">
                                <p className="font-medium">Property Token:</p>
                                <p>This token represents ownership stake in the physical property and its NAV(1:1USDC) value.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rent Income Withdrawal Section (only for Under Management stage) */}
                {selectedInvestment.daoStage === 2 && (
                  <div className="bg-accent rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold flex items-center">
                        <DollarSign className="mr-2 h-5 w-5" />
                        Rent Income Withdrawal
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {/* Max Withdrawable Info */}
                      <div className="bg-background rounded-lg p-4 border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Max Withdrawable:</span>
                          <span className="font-semibold text-lg">
                            {formatUnits(maxWithdrawable, 18)} USDC
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-muted-foreground">Status:</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            maxWithdrawable > BigInt(0) 
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                              : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          }`}>
                            {maxWithdrawable > BigInt(0) ? 'Income Available' : 'No Income Available'}
                          </span>
                        </div>
                      </div>

                    {/* Withdrawal Form */}
                    {maxWithdrawable > BigInt(0) && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Withdrawal Amount (USDC)
                          </label>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={formatUnits(maxWithdrawable, 18)}
                              value={withdrawalAmount}
                              onChange={(e) => setWithdrawalAmount(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                              disabled={isWithdrawing}
                            />
                            <button
                              onClick={() => setWithdrawalAmount(formatUnits(maxWithdrawable, 18))}
                              className="px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                              disabled={isWithdrawing}
                            >
                              Max
                            </button>
                          </div>
                        </div>

                        {/* Withdrawal Button */}
                        <button
                          onClick={handleWithdrawRent}
                          disabled={
                            isWithdrawing || 
                            !withdrawalAmount || 
                            parseFloat(withdrawalAmount) <= 0 ||
                            parseFloat(withdrawalAmount) > parseFloat(formatUnits(maxWithdrawable, 18))
                          }
                          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                            withdrawalStep === 'success'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : withdrawalStep === 'error'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : isWithdrawing || withdrawalStep === 'confirming'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-not-allowed'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90'
                          }`}
                        >
                          {withdrawalStep === 'success' ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              <span>Withdrawal Successful!</span>
                            </>
                          ) : withdrawalStep === 'error' ? (
                            <>
                              <XCircle className="h-4 w-4" />
                              <span>Withdrawal Failed</span>
                            </>
                          ) : isWithdrawing || withdrawalStep === 'confirming' ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>
                                {withdrawalStep === 'confirming' ? 'Confirming...' : 'Withdrawing...'}
                              </span>
                            </>
                          ) : (
                            <>
                              <DollarSign className="h-4 w-4" />
                              <span>Withdraw Rent Income</span>
                            </>
                          )}
                        </button>

                        {/* Transaction Hash Display */}
                        {withdrawalHash && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <Info className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800">Transaction Hash:</span>
                            </div>
                            <p className="text-xs font-mono text-blue-700 mt-1 break-all">
                              {withdrawalHash}
                            </p>
                          </div>
                        )}

                        {/* Status Messages */}
                        {withdrawalStep === 'success' && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm font-medium text-green-800">
                                Rent income withdrawn successfully!
                              </span>
                            </div>
                            <p className="text-xs text-green-700 mt-1">
                              Your rent income has been transferred to your wallet. The form will reset automatically.
                            </p>
                          </div>
                        )}

                        {withdrawalStep === 'error' && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <XCircle className="h-4 w-4 text-red-600" />
                              <span className="text-sm font-medium text-red-800">
                                Withdrawal failed
                              </span>
                            </div>
                            <p className="text-xs text-red-700 mt-1">
                              There was an error processing your withdrawal. Please try again.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* No Income Available Message */}
                    {maxWithdrawable === BigInt(0) && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                          <Info className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-800">
                            No rent income available for withdrawal
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">
                          Rent income will become available after the property manager harvests rent from the property.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Redeem Liquidation Proceeds Section (for liquidated properties) */}
                {selectedInvestment.daoStage === 4 && (
                  <div className="bg-accent rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold flex items-center">
                        <DollarSign className="mr-2 h-5 w-5 text-red-600" />
                        Redeem Liquidation Proceeds
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {/* Your Shares Info */}
                      <div className="bg-background rounded-lg p-4 border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Your Shares:</span>
                          <span className="font-semibold text-lg">
                            {formatUnits(selectedInvestment.shares, 18)} Shares
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-muted-foreground">Share Percentage:</span>
                          <span className="font-semibold">
                            {selectedInvestment.sharePercentage.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-muted-foreground">Status:</span>
                          <span className="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                            Property Liquidated
                          </span>
                        </div>
                      </div>

                      {/* Redeem Form */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Shares to Redeem
                          </label>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={formatUnits(selectedInvestment.shares, 18)}
                              value={redeemSharesAmount}
                              onChange={(e) => setRedeemSharesAmount(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                              disabled={isWithdrawing}
                            />
                            <button
                              onClick={() => setRedeemSharesAmount(formatUnits(selectedInvestment.shares, 18))}
                              className="px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                              disabled={isWithdrawing}
                            >
                              Max
                            </button>
                          </div>
                        </div>

                        {/* Redeem Button */}
                        <button
                          onClick={handleRedeemShares}
                          disabled={
                            isWithdrawing || 
                            !redeemSharesAmount || 
                            parseFloat(redeemSharesAmount) <= 0 ||
                            parseFloat(redeemSharesAmount) > parseFloat(formatUnits(selectedInvestment.shares, 18))
                          }
                          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                            withdrawalStep === 'success'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : withdrawalStep === 'error'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : isWithdrawing || withdrawalStep === 'confirming'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {withdrawalStep === 'success' ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              <span>Redeemed Successfully!</span>
                            </>
                          ) : withdrawalStep === 'error' ? (
                            <>
                              <XCircle className="h-4 w-4" />
                              <span>Redeem Failed</span>
                            </>
                          ) : isWithdrawing || withdrawalStep === 'confirming' ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>
                                {withdrawalStep === 'confirming' ? 'Confirming...' : 'Redeeming...'}
                              </span>
                            </>
                          ) : (
                            <>
                              <DollarSign className="h-4 w-4" />
                              <span>Redeem Shares</span>
                            </>
                          )}
                        </button>

                        {/* Transaction Hash Display */}
                        {withdrawalHash && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <Info className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800">Transaction Hash:</span>
                            </div>
                            <p className="text-xs font-mono text-blue-700 mt-1 break-all">
                              {withdrawalHash}
                            </p>
                          </div>
                        )}

                        {/* Status Messages */}
                        {withdrawalStep === 'success' && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm font-medium text-green-800">
                                Shares redeemed successfully!
                              </span>
                            </div>
                            <p className="text-xs text-green-700 mt-1">
                              Your liquidation proceeds have been transferred to your wallet. The form will reset automatically.
                            </p>
                          </div>
                        )}

                        {withdrawalStep === 'error' && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <XCircle className="h-4 w-4 text-red-600" />
                              <span className="text-sm font-medium text-red-800">
                                Redeem failed
                              </span>
                            </div>
                            <p className="text-xs text-red-700 mt-1">
                              There was an error redeeming your shares. Please try again.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Information Box */}
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                          <Info className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-red-800">
                            Liquidation Complete
                          </span>
                        </div>
                        <p className="text-xs text-red-700 mt-1">
                          This property has been liquidated. Redeeming your shares will burn them and transfer your proportional share of the liquidation proceeds to your wallet.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Proposals Section */}
                <div className="bg-accent rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold flex items-center">
                      <Vote className="mr-2 h-5 w-5" />
                      Proposals ({selectedInvestment.proposals.length})
                    </h3>
                    <div className="flex items-center space-x-2">
                      {(selectedInvestment.daoStage === 2 || selectedInvestment.daoStage === 3) && selectedInvestment.daoAddress && (
                        <button
                          onClick={() => handleOpenCreateProposalModal(selectedInvestment)}
                          className="flex items-center space-x-1 px-3 py-1 text-sm bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-200 transition-colors"
                        >
                          <Vote className="h-3 w-3" />
                          <span>Create Proposal</span>
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const updatedProposals = await fetchPropertyProposals(selectedInvestment.daoAddress, selectedInvestment.propertyId)
                          const updatedInvestment = {
                            ...selectedInvestment,
                            proposals: updatedProposals
                          }
                          setSelectedInvestment(updatedInvestment)
                        }}
                        className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-200 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Refresh Proposals</span>
                      </button>
                    </div>
                  </div>

                  {selectedInvestment.proposals.length === 0 ? (
                    <div className="text-center py-8">
                      <Vote className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No proposals found for this property</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Proposals will appear here when they are created for this property.
                      </p>
                      {(selectedInvestment.daoStage === 2 || selectedInvestment.daoStage === 3) && selectedInvestment.daoAddress && (
                        <div className="mt-4">
                          <button
                            onClick={() => handleOpenCreateProposalModal(selectedInvestment)}
                            className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-200 transition-colors"
                          >
                            <Vote className="h-4 w-4" />
                            <span>Create First Proposal</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedInvestment.proposals.map((proposal) => (
                        <div key={proposal.id} className="bg-background rounded-lg p-4 border">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">Proposal #{proposal.id}</h4>
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  proposal.proposalType === 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                  proposal.proposalType === 1 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                                  proposal.proposalType === 2 ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                  proposal.proposalType === 3 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                  proposal.proposalType === 4 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                  proposal.proposalType === 5 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                  proposal.proposalType === 6 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                  proposal.proposalType === 7 ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                  'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                }`}>
                                  {proposal.proposalType === 0 ? 'Property Liquidation' :
                                   proposal.proposalType === 1 ? 'Property Purchase' : 
                                   proposal.proposalType === 2 ? 'Threshold Update' :
                                   proposal.proposalType === 3 ? 'Management Change' :
                                   proposal.proposalType === 4 ? 'NAV Update' :
                                   proposal.proposalType === 5 ? 'Emergency Pause' :
                                   proposal.proposalType === 6 ? 'Emergency Unpause' :
                                   proposal.proposalType === 7 ? 'Property Stage Change' : 'Other'}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{proposal.description}</p>
                            
                            {/* Show liquidation price for Property Liquidation proposals */}
                            {proposal.proposalType === 0 && proposal.data && proposal.data !== '0x' && (
                              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                                <DollarSign className="h-4 w-4 text-red-600" />
                                <span className="text-sm font-medium text-red-800">
                                  Liquidation Price: 
                                  <span className="ml-1 font-bold">
                                    ${parseFloat(decodeLiquidationPrice(proposal.data) || '0').toLocaleString()} USDC
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            proposal.status === 'Active' 
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : proposal.executed
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          }`}>
                            {proposal.status}
                          </span>
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

                          {/* User Vote Status */}
                          {proposal.userVote && (
                            <div className={`mb-4 p-3 rounded-lg border-2 ${
                              proposal.userVote.hasVoted
                                ? proposal.userVote.support
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-red-50 border-red-200'
                                : 'bg-yellow-50 border-yellow-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <span className="text-sm font-medium">Your Vote:</span>
                                  <span className={`ml-2 px-3 py-1 rounded-full text-sm font-semibold flex items-center ${
                                    proposal.userVote.hasVoted
                                      ? proposal.userVote.support
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                  }`}>
                                    {proposal.userVote.hasVoted
                                      ? proposal.userVote.support 
                                        ? <><CheckIcon className="h-3 w-3 mr-1" />VOTED YES</>
                                        : <><XCircle className="h-3 w-3 mr-1" />VOTED NO</>
                                      : <><Clock className="h-3 w-3 mr-1" />NOT VOTED</>
                                    }
                                  </span>
                                </div>
                                {proposal.userVote.hasVoted && (
                                  <div className="text-right">
                                    <span className="text-sm text-muted-foreground">Vote Weight:</span>
                                    <p className="font-semibold text-sm">
                                      {formatUnits(proposal.userVote.weight, 18)} shares
                                    </p>
                                  </div>
                                )}
                              </div>
                              {proposal.userVote.hasVoted && (
                                <div className="mt-2 text-xs text-muted-foreground flex items-center">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Your vote has been recorded on-chain
                                </div>
                              )}
                            </div>
                          )}

                          {/* Voting Buttons */}
                          {proposal.status === 'Active' && (!proposal.userVote?.hasVoted) && (
                            <div className="flex space-x-3">
                              <button
                                onClick={() => handleVote(selectedInvestment.propertyId, proposal.id, true)}
                                disabled={loading && votingProposal?.proposalId === proposal.id && votingSupport === true}
                                className="flex items-center space-x-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-200 disabled:opacity-50 transition-colors"
                              >
                                {loading && votingProposal?.proposalId === proposal.id && votingSupport === true ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Voting...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckIcon className="h-4 w-4" />
                                    <span>Vote YES</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleVote(selectedInvestment.propertyId, proposal.id, false)}
                                disabled={loading && votingProposal?.proposalId === proposal.id && votingSupport === false}
                                className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                              >
                                {loading && votingProposal?.proposalId === proposal.id && votingSupport === false ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Voting...</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4" />
                                    <span>Vote NO</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Proposal Modal */}
        {showCreateProposalModal && selectedPropertyForProposal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Create Proposal</h2>
                  <button
                    onClick={closeCreateProposalModal}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Property Info */}
                <div className="bg-accent rounded-lg p-4 mb-6">
                  <h3 className="font-semibold mb-2 text-orange-600">{selectedPropertyForProposal.propertyName}</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Property #{selectedPropertyForProposal.propertyId}</p>
                    <p>Your Shares: {formatUnits(selectedPropertyForProposal.shares, 18)}</p>
                    <p>Voting Power: {formatUnits(selectedPropertyForProposal.votingPower, 18)} shares</p>
                  </div>
                </div>

                {/* Proposal Form */}
                <div className="space-y-4">
                  {/* Proposal Type */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Proposal Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={proposalType}
                      onChange={(e) => setProposalType(e.target.value)}
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                      disabled={isCreatingProposal}
                    >
                      <option value="0">Property Liquidation</option>
                      <option value="2">Threshold Update</option>
                      <option value="3">Management Change</option>
                      <option value="5">Emergency Pause</option>
                      <option value="6">Emergency Unpause</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {proposalType === '0' && 'Propose to liquidate the property due to market conditions'}
                      {proposalType === '2' && 'Propose to update voting thresholds for governance decisions'}
                      {proposalType === '3' && 'Propose to change property management or manager'}
                      {proposalType === '5' && 'Propose to pause all operations in case of emergency'}
                      {proposalType === '6' && 'Propose to resume operations after emergency pause'}
                    </p>
                  </div>

                  {/* Proposal Description */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Proposal Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={proposalDescription}
                      onChange={(e) => setProposalDescription(e.target.value)}
                      placeholder="Describe your proposal in detail..."
                      rows={4}
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                      disabled={isCreatingProposal}
                      required
                    />
                  </div>

                  {/* Proposal Data (for specific proposal types) */}
                  {proposalType === '0' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Liquidation Price (USDC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Liquidation Price (USDC)"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        value={proposalData}
                        onChange={(e) => setProposalData(e.target.value)}
                        disabled={isCreatingProposal}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the proposed liquidation price for the property.
                      </p>
                    </div>
                  )}

                  {proposalType === '2' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        New Threshold (%) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="Enter new threshold percentage"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        value={proposalData}
                        onChange={(e) => setProposalData(e.target.value)}
                        disabled={isCreatingProposal}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        New voting threshold as a percentage (e.g., 60 for 60%)
                      </p>
                    </div>
                  )}

                  {/* Status Messages */}
                  {proposalCreationStep === 'success' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">
                          Proposal created successfully!
                        </span>
                      </div>
                      <p className="text-xs text-green-700 mt-1">
                        Your proposal has been submitted and is now active for voting.
                      </p>
                    </div>
                  )}

                  {proposalCreationStep === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-medium text-red-800">
                          Failed to create proposal
                        </span>
                      </div>
                      <p className="text-xs text-red-700 mt-1">
                        There was an error creating your proposal. Please try again.
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={closeCreateProposalModal}
                      disabled={isCreatingProposal}
                      className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateProposal}
                      disabled={
                        isCreatingProposal || 
                        !proposalDescription.trim() ||
                        ((proposalType === '0' || proposalType === '2') && !proposalData.trim())
                      }
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                    >
                      {isCreatingProposal ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Vote className="h-4 w-4" />
                          <span>Create Proposal</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Information Box */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <Info className="h-4 w-4 text-blue-600 mr-2 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">Proposal Creation Guidelines:</p>
                      <ul className="mt-2 space-y-1 text-xs">
                        <li>• Proposals require a 7-day voting period</li>
                        <li>• All investors can vote based on their share ownership</li>
                        <li>• Proposals must receive majority support to be executed</li>
                        <li>• Ensure all details are accurate before submitting</li>
                        <li>• Emergency proposals can pause/unpause operations in critical situations</li>
                      </ul>
                    </div>
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
