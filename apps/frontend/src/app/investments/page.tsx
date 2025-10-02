'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { Building2, Users, DollarSign, Vote, Clock, CheckCircle, AlertTriangle, Eye, MapPin, Calendar, TrendingUp, Loader2, ExternalLink, Copy, CheckCircle2, X, RefreshCw, Info, CheckCircle as CheckIcon, XCircle, AlertCircle } from 'lucide-react'
import { PROPERTY_REGISTRY_ABI, PROPERTY_VAULT_GOVERNANCE_ABI, PROPERTY_DAO_ABI, OFT_USDC_ABI } from '@brickvault/abi'
import { CONTRACT_ADDRESSES } from '../../config/contracts'
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

  const registryAddress = CONTRACT_ADDRESSES.PropertyRegistry
  const { writeContract, writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  // Get property count
  const { data: propertyCount } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'getPropertyCount',
    query: {
      enabled: !!registryAddress && isConnected && chainId === 31337,
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
          const property = propertyData as { name: string; vault: string; depositCap: bigint; totalDeposited: bigint; status: number; paused: boolean; createdAt: bigint }
          
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
    await fetchUserInvestments(true)
  }

  // Handle investment click to show details
  const handleInvestmentClick = async (investment: UserInvestment) => {
    setSelectedInvestment(investment)
    setShowInvestmentModal(true)
  }

  // Close investment modal
  const closeInvestmentModal = () => {
    setShowInvestmentModal(false)
    setSelectedInvestment(null)
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

  // Fetch investments when propertyCount changes
  useEffect(() => {
    if (mounted && propertyCount !== undefined && publicClient && address) {
      fetchUserInvestments(false) // Don't show loading on initial fetch
    }
  }, [mounted, propertyCount, publicClient, address])

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
            Please switch to Localhost network (Chain ID: 31337) to view your investments.
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
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
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
                className="mt-3 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200 transition-colors flex items-center"
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
                      <h3 className="font-semibold text-lg">{investment.propertyName}</h3>
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
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        investment.daoStage === 2
                          ? 'bg-green-100 text-green-800' 
                          : investment.daoStage === 1
                          ? 'bg-blue-100 text-blue-800'
                          : investment.daoStage === 0
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {investment.daoStage === 2 ? 'Under Management' : 
                         investment.daoStage === 1 ? 'Funded' : 
                         investment.daoStage === 0 ? 'Open to Fund' : 'Unknown'}
                      </span>
                      {investment.proposals.filter(p => p.status === 'Active').length > 0 && (
                        <span className="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800 flex items-center">
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
                            className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
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
                  <h2 className="text-3xl font-bold">{selectedInvestment.propertyName} Investment</h2>
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
                            selectedInvestment.daoStage === 2
                              ? 'bg-green-100 text-green-800' 
                              : selectedInvestment.daoStage === 1
                              ? 'bg-blue-100 text-blue-800'
                              : selectedInvestment.daoStage === 0
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedInvestment.daoStage === 2 ? 'Under Management' : 
                             selectedInvestment.daoStage === 1 ? 'Funded' : 
                             selectedInvestment.daoStage === 0 ? 'Open to Fund' : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proposals Section */}
                <div className="bg-accent rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold flex items-center">
                      <Vote className="mr-2 h-5 w-5" />
                      Proposals ({selectedInvestment.proposals.length})
                    </h3>
                    <button
                      onClick={async () => {
                        const updatedProposals = await fetchPropertyProposals(selectedInvestment.daoAddress, selectedInvestment.propertyId)
                        const updatedInvestment = {
                          ...selectedInvestment,
                          proposals: updatedProposals
                        }
                        setSelectedInvestment(updatedInvestment)
                      }}
                      className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Refresh Proposals</span>
                    </button>
                  </div>

                  {selectedInvestment.proposals.length === 0 ? (
                    <div className="text-center py-8">
                      <Vote className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No proposals found for this property</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Proposals will appear here when they are created for this property.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedInvestment.proposals.map((proposal) => (
                        <div key={proposal.id} className="bg-background rounded-lg p-4 border">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">Proposal #{proposal.id}</h4>
                                <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                  {proposal.proposalType === 1 ? 'Property Purchase' : 
                                   proposal.proposalType === 2 ? 'Threshold Update' :
                                   proposal.proposalType === 3 ? 'Management Change' :
                                   proposal.proposalType === 4 ? 'NAV Update' :
                                   proposal.proposalType === 5 ? 'Stage Change' : 'Other'}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{proposal.description}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              proposal.status === 'Active' 
                                ? 'bg-green-100 text-green-800'
                                : proposal.executed
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
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
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
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
                                className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50 transition-colors"
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
                                className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
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
      </div>
    </div>
  )
}
