'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Settings } from 'lucide-react'
import { PROPERTY_REGISTRY_ABI } from '@brickvault/abi'

export function OwnerManagementLink() {
  const { address, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  const registryAddress = process.env.NEXT_PUBLIC_PROPERTY_REGISTRY_ADDRESS as `0x${string}`

  // Get contract owner
  const { data: owner } = useReadContract({
    address: registryAddress,
    abi: PROPERTY_REGISTRY_ABI,
    functionName: 'owner',
    query: {
      enabled: !!registryAddress && isConnected,
    },
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && owner && address) {
      setIsOwner(address.toLowerCase() === (owner as string).toLowerCase())
    }
  }, [mounted, owner, address])

  // Don't render anything if not mounted, not connected, or not owner
  if (!mounted || !isConnected || !isOwner) {
    return null
  }

  return (
    <a 
      href="/management" 
      className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      <Settings className="h-4 w-4 mr-1" />
      Management
    </a>
  )
}
