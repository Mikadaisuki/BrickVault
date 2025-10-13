'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Vote, Users, Clock, CheckCircle } from 'lucide-react'

const PROPERTY_DAO_ABI = [
  {
    "inputs": [],
    "name": "getAllProposals",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "getProposalInfo",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "proposalType",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "yesVotes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "noVotes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "startTime",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "endTime",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "executed",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const

interface Proposal {
  id: string
  type: number
  description: string
  yesVotes: string
  noVotes: string
  startTime: number
  endTime: number
  executed: boolean
}

const PROPOSAL_TYPES = {
  1: 'Property Purchase',
  2: 'Rent Distribution',
  3: 'Property Sale',
  4: 'NAV Update',
  5: 'Governance Change'
}

export function DAOGovernance() {
  const { address, isConnected } = useAccount()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const propertyDAOAddress = process.env.NEXT_PUBLIC_PROPERTY_DAO_ADDRESS as `0x${string}`

  const { data: allProposals } = useReadContract({
    address: propertyDAOAddress,
    abi: PROPERTY_DAO_ABI,
    functionName: 'getAllProposals',
    query: {
      enabled: !!propertyDAOAddress && isConnected && mounted,
    },
  })

  useEffect(() => {
    if (allProposals && allProposals.length > 0) {
      // For now, we'll use mock data since we need to fetch proposal details
      const mockProposals: Proposal[] = [
        {
          id: '1',
          type: 4,
          description: 'Update property NAV to reflect current market value',
          yesVotes: '1500000',
          noVotes: '200000',
          startTime: Date.now() - 86400000, // 1 day ago
          endTime: Date.now() + 86400000, // 1 day from now
          executed: false
        }
      ]
      setProposals(mockProposals)
    }
  }, [allProposals])

  const getProposalStatus = (proposal: Proposal) => {
    if (proposal.executed) return 'Executed'
    if (Date.now() > proposal.endTime) return 'Ended'
    if (Date.now() < proposal.startTime) return 'Pending'
    return 'Active'
  }

  const getProposalStatusColor = (proposal: Proposal) => {
    const status = getProposalStatus(proposal)
    switch (status) {
      case 'Executed': return 'bg-green-500/20 text-green-400 border border-green-500/30'
      case 'Ended': return 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
      case 'Active': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      case 'Pending': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
      default: return 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
    }
  }

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Vote className="mr-2 h-5 w-5" />
          DAO Governance
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
          <Vote className="mr-2 h-5 w-5" />
          DAO Governance
        </h2>
        <p className="text-muted-foreground">Connect your wallet to view governance proposals</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Vote className="mr-2 h-5 w-5" />
        DAO Governance
      </h2>
      
      {proposals.length === 0 ? (
        <div className="text-center py-8">
          <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No governance proposals found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Create the first proposal to start governing your property
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <div key={proposal.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
                      {PROPOSAL_TYPES[proposal.type as keyof typeof PROPOSAL_TYPES] || 'Unknown'}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs ${getProposalStatusColor(proposal)}`}>
                      {getProposalStatus(proposal)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Proposal #{proposal.id}</h3>
                  <p className="text-muted-foreground text-sm">{proposal.description}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700">Yes Votes</p>
                      <p className="font-semibold text-green-900">
                        {(Number(proposal.yesVotes) / 1e18).toFixed(2)} Shares
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                </div>
                
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-700">No Votes</p>
                      <p className="font-semibold text-red-900">
                        {(Number(proposal.noVotes) / 1e18).toFixed(2)} Shares
                      </p>
                    </div>
                    <Vote className="h-5 w-5 text-red-500" />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Clock className="mr-1 h-3 w-3" />
                  <span>
                    {new Date(proposal.startTime).toLocaleDateString()} - {new Date(proposal.endTime).toLocaleDateString()}
                  </span>
                </div>
                <button className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 transition-colors">
                  Vote
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
