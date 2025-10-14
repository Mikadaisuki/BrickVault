'use client'

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { useEffect, useState } from 'react'
import { Wallet, ChevronDown, LogOut, Copy, CheckCircle, AlertCircle, Loader2, X, ExternalLink } from 'lucide-react'

export function WalletConnectButton() {
  const { address, isConnected, connector } = useAccount()
  const { connectors, connect, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { chains, switchChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check if MetaMask is installed
    if (typeof window !== 'undefined') {
      setIsMetaMaskInstalled(typeof window.ethereum !== 'undefined')
    }
  }, [])

  // Get current chain name
  const currentChain = chains.find(c => c.id === chainId)
  const chainName = currentChain?.name || 'Unknown Network'

  // Copy address to clipboard
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Get wallet icon (MetaMask only)
  const getWalletIcon = (connectorName: string) => {
    return '🦊' // MetaMask
  }

  // Show loading state during hydration
  if (!mounted) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-secondary/50 text-muted-foreground rounded-lg cursor-not-allowed flex items-center gap-2"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden sm:inline">Loading...</span>
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <>
        <button
          onClick={() => setShowAccountModal(true)}
          className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-foreground rounded-lg transition-colors flex items-center gap-2"
        >
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="hidden sm:inline font-mono text-sm">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <Wallet className="h-4 w-4 sm:hidden" />
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Account Modal */}
        {showAccountModal && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-end z-50 p-4 pt-20"
            onClick={() => setShowAccountModal(false)}
          >
            <div 
              className="bg-background border border-border rounded-xl shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Account
                </h2>
                <button
                  onClick={() => setShowAccountModal(false)}
                  className="p-1 hover:bg-accent rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Wallet Info */}
              <div className="bg-accent rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Connected Wallet</span>
                  <div className="flex items-center gap-2 px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs font-medium">Connected</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{getWalletIcon(connector?.name || '')}</span>
                  <span className="font-semibold">{connector?.name || 'Unknown'}</span>
                </div>

                <div className="bg-background rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm break-all">{address}</span>
                    <button
                      onClick={copyAddress}
                      className="ml-2 p-2 hover:bg-accent rounded-lg transition-colors flex-shrink-0"
                      title="Copy address"
                    >
                      {copied ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network:</span>
                  <span className="font-semibold">{chainName}</span>
                </div>
              </div>

              {/* Network Switcher - Only show Hub (Sepolia) and Spoke (BNB Testnet) */}
              {(() => {
                // Filter to only show production networks: Sepolia (11155111) and BNB Testnet (97)
                const productionChains = chains.filter(c => c.id === 11155111 || c.id === 97)
                
                if (productionChains.length === 0) return null

                return (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Switch Network</h3>
                    <div className="space-y-2">
                      {productionChains.map((chain) => (
                        <button
                          key={chain.id}
                          onClick={() => {
                            switchChain({ chainId: chain.id })
                            setShowAccountModal(false)
                          }}
                          disabled={chain.id === chainId}
                          className={`w-full px-4 py-3 rounded-lg text-left transition-colors flex items-center justify-between ${
                            chain.id === chainId
                              ? 'bg-primary/20 border border-primary/40 text-primary cursor-default'
                              : 'bg-accent hover:bg-accent/80 border border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              chain.id === chainId ? 'bg-green-500' : 'bg-gray-500'
                            }`}></div>
                            <span className="font-medium">
                              {chain.id === 11155111 ? '🔷 Sepolia (Hub)' : '🟡 BNB Testnet (Spoke)'}
                            </span>
                          </div>
                          {chain.id === chainId && (
                            <CheckCircle className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Disconnect Button */}
              <button
                onClick={() => {
                  disconnect()
                  setShowAccountModal(false)
                }}
                className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold"
              >
                <LogOut className="h-4 w-4" />
                Disconnect Wallet
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => {
          // If MetaMask is installed, connect directly without modal
          if (isMetaMaskInstalled && connectors.length === 1) {
            connect({ connector: connectors[0] })
          } else {
            setShowModal(true)
          }
        }}
        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2 font-semibold"
      >
        <Wallet className="h-4 w-4" />
        <span className="hidden sm:inline">Connect Wallet</span>
      </button>

      {/* Wallet Selection Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-end z-50 p-4 pt-20"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-background border border-border rounded-xl shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6 text-primary" />
                Connect Wallet
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-accent rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-800 dark:text-red-300">
                    <p className="font-medium">Connection Failed</p>
                    <p className="text-xs mt-1">{error.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* MetaMask Not Installed Warning */}
            {!isMetaMaskInstalled && (
              <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-orange-800 dark:text-orange-300 mb-1">
                      MetaMask Not Detected
                    </p>
                    <p className="text-xs text-orange-700 dark:text-orange-400 mb-3">
                      To use BrickVault, you need to install MetaMask browser extension.
                    </p>
                    <a
                      href="https://metamask.io/download/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-semibold"
                    >
                      <span>Install MetaMask</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* MetaMask Option */}
            {isMetaMaskInstalled && (
              <button
                onClick={() => {
                  const connector = connectors[0] // Use first connector (injected/MetaMask)
                  if (connector) {
                    connect({ connector })
                    if (!isPending) {
                      setShowModal(false)
                    }
                  }
                }}
                disabled={isPending || connectors.length === 0}
                className="w-full px-4 py-4 bg-accent hover:bg-accent/80 border border-border rounded-lg transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🦊</span>
                  <div className="text-left">
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      MetaMask
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connect with browser extension
                    </p>
                  </div>
                </div>
                {isPending && (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

