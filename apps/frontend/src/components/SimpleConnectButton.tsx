'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useEffect, useState } from 'react'

export function SimpleConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Show loading state during hydration
  if (!mounted) {
    return (
      <button
        disabled
        className="px-6 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed"
      >
        Loading...
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center space-x-4">
        <div className="text-sm text-muted-foreground">
          Connected: {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
    >
      Connect Wallet
    </button>
  )
}
