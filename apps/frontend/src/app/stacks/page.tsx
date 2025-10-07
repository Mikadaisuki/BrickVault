'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, pad } from 'viem'
import { 
  authenticate
} from '@stacks/connect'
// @ts-ignore - v8+ APIs may not be properly recognized in types
import { connect, disconnect, isConnected, request as stacksRequest } from '@stacks/connect'
import { UserSession } from '@stacks/auth'
import { 
  Cl, 
  uintCV,
  Pc
} from '@stacks/transactions'
import { 
  ArrowRight, 
  ArrowLeft, 
  Building2, 
  DollarSign, 
  TrendingUp, 
  Wallet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Zap,
  Bitcoin,
  Link,
  ExternalLink,
  Copy,
  CheckCircle2,
  X,
  RefreshCw,
  Info,
  Clock,
  Shield,
  Globe
} from 'lucide-react'
import { Header } from '@/components/Header'
import { CONTRACT_ADDRESSES } from '../../config/contracts'

// Real Stacks integration using @stacks/connect
interface StacksAccount {
  address: string
  balance: string
  sbtcBalance: string
  isConnected: boolean
  publicKey?: string
  btcAddress?: string
}

interface StacksDeposit {
  id: string
  amount: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'minted' | 'failed'
  txHash?: string
  oftusdcAmount?: string
}

export default function StacksPage() {
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })
  const publicClient = usePublicClient()
  
  // Handle hydration by tracking if we're on the client
  const [isClient, setIsClient] = useState(false)
  
  // Stacks wallet state
  const [stacksAccount, setStacksAccount] = useState<StacksAccount | null>(null)
  const [stacksConnected, setStacksConnected] = useState(false)
  
  // Registration state
  const [evmCustodianAddress, setEvmCustodianAddress] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [registrationStep, setRegistrationStep] = useState<'idle' | 'registering' | 'success' | 'error'>('idle')
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false)
  const [registeredEvmAddress, setRegisteredEvmAddress] = useState<string | null>(null)
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  
  // Deposit state
  const [depositAmount, setDepositAmount] = useState('')
  const [depositToken, setDepositToken] = useState<'STX' | 'sBTC'>('sBTC')
  const [depositStep, setDepositStep] = useState<'idle' | 'depositing' | 'success' | 'error'>('idle')
  const [deposits, setDeposits] = useState<StacksDeposit[]>([])
  
  // Configuration for local devnet
  // Local Stacks API: http://localhost:3999
  // Extended API: http://localhost:3999/extended
  // Gateway Contract: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.brick-vault-gateway
  const [mockMinDeposit] = useState('0.001') // Mock minimum deposit
  const [mockTotalLocked] = useState('15.7') // Mock total value locked
  
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Helper function to update account state with balances
  const updateAccountState = async (
    stxAddress: string, 
    btcAddress?: string, 
    publicKey?: string
  ) => {
    const [stxBalance, sbtcBalance] = await Promise.all([
      fetchStxBalance(stxAddress),
      fetchSbtcBalance(stxAddress)
    ])
    
    setStacksAccount({
      address: stxAddress,
      balance: stxBalance,
      sbtcBalance: sbtcBalance,
      isConnected: true,
      btcAddress: btcAddress || '',
      publicKey: publicKey
    })
    setStacksConnected(true)
    
    console.log('✅ Connected to Stacks wallet:', stxAddress)
    console.log('📊 STX Balance:', stxBalance)
    console.log('📊 sBTC Balance:', sbtcBalance)
    
    // Check registration status after connecting
    await checkRegistrationStatus(stxAddress)
  }

  // Connect to Stacks wallet using modern @stacks/connect API
  const connectStacksWallet = async () => {
    if (stacksConnected) {
      console.log('Already connected')
      return
    }

    try {
      // Use modern @stacks/connect API
      const response = await connect()
      
      if (response?.addresses && Array.isArray(response.addresses)) {
        // Find STX and BTC addresses from the addresses array
        const stxAddr = response.addresses.find((addr) => addr.symbol === 'STX')
        const btcAddr = response.addresses.find((addr) => 
          addr.symbol === 'BTC' && (addr as { type?: string }).type === 'p2wpkh'
        )
        
        if (stxAddr) {
          await updateAccountState(
            stxAddr.address,
            btcAddr?.address,
            stxAddr.publicKey
          )
          
          console.log('Connected to Stacks wallet:', stxAddr.address)
          return
        }
      }

      if (isConnected()) {
        console.log('Wallet is connected');
      }
      
      throw new Error('No addresses returned from wallet')
    } catch (error) {
      console.error('Failed to connect Stacks wallet:', error)
      alert('Failed to connect Stacks wallet. Please make sure you have a Stacks wallet installed and try again.')
    }
  }

  // Disconnect Stacks wallet using modern @stacks/connect API
  const disconnectStacksWallet = () => {
    disconnect() // Modern API to clear connection state
    setStacksAccount(null)
    setStacksConnected(false)
    setRegistrationStep('idle')
    console.log('User disconnected')
  }

  // Fetch real STX balance from Stacks API
  const fetchStxBalance = async (address: string): Promise<string> => {
    try {
      const response = await fetch(`http://localhost:3999/v2/accounts/${address}`)
      const data = await response.json()
      
      if (data.balance) {
        const balanceMicroStx = parseInt(data.balance, 16)
        return (balanceMicroStx / 1_000_000).toFixed(6)
      }
      return '0'
    } catch (error) {
      console.error('Failed to fetch STX balance:', error)
      return '0'
    }
  }

  // Fetch sBTC balance from Stacks Extended API
  const fetchSbtcBalance = async (address: string): Promise<string> => {
    try {
      const response = await fetch(`http://localhost:3999/extended/v2/addresses/${address}/balances/ft`)
      const data = await response.json()
      
      if (data.results && Array.isArray(data.results)) {
        const sbtcToken = data.results.find((token: { token: string; balance: string }) => 
          token.token.includes('sbtc-token') || token.token.includes('sbtc')
        )
        
        if (sbtcToken?.balance) {
          return (parseInt(sbtcToken.balance) / 1_000_000).toFixed(6)
        }
      }
      return '0'
    } catch (error) {
      console.error('Failed to fetch sBTC balance:', error)
      return '0'
    }
  }

  // Helper function to refresh balances
  const refreshBalances = async () => {
    if (!stacksAccount?.address) return
    
    const [stxBalance, sbtcBalance] = await Promise.all([
      fetchStxBalance(stacksAccount.address),
      fetchSbtcBalance(stacksAccount.address)
    ])
    
    setStacksAccount(prev => prev ? { 
      ...prev, 
      balance: stxBalance, 
      sbtcBalance 
    } : null)
  }

  // Fetch transaction status from Stacks API
  const fetchTransactionStatus = async (txid: string): Promise<'pending' | 'confirmed' | 'failed'> => {
    try {
      const response = await fetch(`http://localhost:3999/extended/v1/tx/${txid}`)
      const data = await response.json()
      
      console.log('Transaction status:', data.tx_status)
      console.log('Transaction data:', data)
      
      if (data.tx_status === 'success') {
        return 'confirmed'
      } else if (data.tx_status === 'pending') {
        return 'pending'
      } else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
        return 'failed'
      }
      
      return 'pending'
    } catch (error) {
      console.error('Failed to fetch transaction status:', error)
      return 'pending'
    }
  }

  // Poll transaction status until it's confirmed or failed
  const pollTransactionStatus = async (txid: string, depositId: string, maxAttempts: number = 30) => {
    console.log(`Starting to poll transaction status for txid: ${txid}`)
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await fetchTransactionStatus(txid)
      
      console.log(`Attempt ${attempt + 1}/${maxAttempts} - Status: ${status}`)
      
      // Update deposit status
      setDeposits(prev => prev.map(dep => 
        dep.id === depositId ? { ...dep, status } : dep
      ))
      
      if (status === 'confirmed') {
        console.log('✅ Transaction confirmed!')
        // In a real implementation, you might want to check for the mint event here
        setTimeout(() => {
          setDeposits(prev => prev.map(dep => 
            dep.id === depositId ? { ...dep, status: 'minted' } : dep
          ))
        }, 3000) // Simulate minting delay
        return 'confirmed'
      } else if (status === 'failed') {
        console.log('❌ Transaction failed!')
        return 'failed'
      }
      
      // Wait 3 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.warn('Transaction polling timed out')
    return 'pending'
  }

  // Check if Stacks address is already registered
  const checkRegistrationStatus = async (stacksAddress: string) => {
    setIsCheckingRegistration(true)
    try {
      // Convert principal to hex for API call
      const principalCv = Cl.principal(stacksAddress)
      // Use cvToHex from @stacks/transactions
      const { cvToHex } = await import('@stacks/transactions')
      const principalHex = cvToHex(principalCv)
      
      // Call read-only function using Stacks API
      const response = await fetch(
        'http://localhost:3999/v2/contracts/call-read/ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM/brick-vault-gateway/get-evm-custodian',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: stacksAddress,
            arguments: [principalHex]
          })
        }
      )
      
      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text()
        console.warn('Failed to check registration status:', response.status, errorText)
        setRegisteredEvmAddress(null)
        setRegistrationStep('idle')
        return null
      }
      
      const data = await response.json()
      
      if (data.okay && data.result) {
        // Parse the result - it's a response wrapped optional
        const resultHex = data.result
        
        // Check if it's a (some ...) value (0x0a prefix indicates optional-some)
        // Result format: 0x07 (ok prefix) + 0x0a (some prefix) + 0x02 (buffer prefix) + length + data
        if (resultHex.includes('0a')) {
          // Extract the buffer value
          const bufferStart = resultHex.indexOf('0200000014') // 0x02 (buffer) + 0x00000014 (20 bytes length)
          if (bufferStart !== -1) {
            // Extract 20 bytes (40 hex chars) after the length indicator
            const evmAddressHex = resultHex.slice(bufferStart + 10, bufferStart + 10 + 40)
            const evmAddress = `0x${evmAddressHex}`
            
            setRegisteredEvmAddress(evmAddress)
            setEvmCustodianAddress(evmAddress)
            setRegistrationStep('success')
            return evmAddress
          }
        }
      }
      
      // Not registered or none value
      setRegisteredEvmAddress(null)
      setRegistrationStep('idle')
      return null
    } catch (error) {
      console.error('Failed to check registration status:', error)
      setRegisteredEvmAddress(null)
      return null
    } finally {
      setIsCheckingRegistration(false)
    }
  }

  // Register Stacks address with EVM custodian
  const registerStacksAddress = async () => {
    if (!stacksAccount?.address || !evmCustodianAddress) {
      alert('Please provide both Stacks address and EVM custodian address')
      return
    }

    // Validate EVM address format
    if (!evmCustodianAddress.startsWith('0x') || evmCustodianAddress.length !== 42) {
      alert('Please provide a valid EVM address (0x followed by 40 hex characters)')
      return
    }

    setIsRegistering(true)
    setRegistrationStep('registering')

    try {
      // Convert EVM address (0x...) to buffer (remove 0x prefix and convert to bytes)
      const evmAddressHex = evmCustodianAddress.slice(2) // Remove "0x" prefix
      const evmAddressBuffer = Cl.buffer(Buffer.from(evmAddressHex, 'hex'))
      
      // Use modern @stacks/connect request method with stx_callContract
      const response = await stacksRequest('stx_callContract', {
        contract: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.brick-vault-gateway',
        functionName: 'register-stacks-address',
        functionArgs: [evmAddressBuffer],
        network: 'devnet'
      })
      
      console.log('Registration transaction ID:', response.txid)
      setRegisteredEvmAddress(evmCustodianAddress)
      setRegistrationStep('success')
      setIsRegistering(false)
      alert('Stacks address registered successfully! You can now deposit assets.')
    } catch (error) {
      console.error('Registration failed:', error)
      setRegistrationStep('error')
      setIsRegistering(false)
      alert('Registration failed. Please try again.')
    }
  }

  // Update EVM custodian address
  const updateEvmCustodian = async () => {
    if (!stacksAccount?.address || !evmCustodianAddress) {
      alert('Please provide a new EVM custodian address')
      return
    }

    // Validate EVM address format
    if (!evmCustodianAddress.startsWith('0x') || evmCustodianAddress.length !== 42) {
      alert('Please provide a valid EVM address (0x followed by 40 hex characters)')
      return
    }

    // Check if the new address is the same as the current one
    if (evmCustodianAddress === registeredEvmAddress) {
      alert('The new address is the same as the current one')
      return
    }

    setIsRegistering(true)
    setRegistrationStep('registering')

    try {
      // Convert EVM address (0x...) to buffer (remove 0x prefix and convert to bytes)
      const evmAddressHex = evmCustodianAddress.slice(2) // Remove "0x" prefix
      const evmAddressBuffer = Cl.buffer(Buffer.from(evmAddressHex, 'hex'))
      
      // Use modern @stacks/connect request method with stx_callContract
      const response = await stacksRequest('stx_callContract', {
        contract: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.brick-vault-gateway',
        functionName: 'update-evm-custodian',
        functionArgs: [evmAddressBuffer],
        network: 'devnet'
      })
      
      console.log('Update transaction ID:', response.txid)
      setRegisteredEvmAddress(evmCustodianAddress)
      setRegistrationStep('success')
      setIsRegistering(false)
      setShowUpdateForm(false)
      alert('EVM custodian address updated successfully!')
    } catch (error) {
      console.error('Update failed:', error)
      setRegistrationStep('error')
      setIsRegistering(false)
      alert('Update failed. Please try again.')
    }
  }

  // Deposit tokens (STX or sBTC)
  const depositAsset = async () => {
    if (!depositAmount || !stacksAccount?.address) {
      alert('Please enter amount and ensure Stacks wallet is connected')
      return
    }

    const amount = parseFloat(depositAmount)
    if (amount < parseFloat(mockMinDeposit)) {
      alert(`Minimum deposit amount is ${mockMinDeposit} ${depositToken}`)
      return  
    }

    setDepositStep('depositing')

    try {
      // Convert amount to micro units (6 decimals)
      const amountMicro = Math.floor(amount * 1000000)
      const arg = uintCV(amountMicro);

      console.log('Deposit amount:', amount)
      console.log('Deposit amount micro:', amountMicro)
      console.log('Deposit arg:', arg)
      
      // Create post-condition for sBTC transfer using the Pc (Post Condition) fluent API
      // This ensures the user can only transfer up to the specified amount of sBTC
      // Reference: @stacks/transactions v7+ uses the Pc namespace
      const postCondition = Pc.principal(stacksAccount.address)
        .willSendLte(amountMicro)
        .ft('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token', 'sbtc-token');
      
      console.log('Post-condition created:', postCondition)
      
      // Use modern @stacks/connect request method with stx_callContract
      // @ts-ignore - v8+ API may not have complete type definitions yet
      const response = await stacksRequest('stx_callContract', {
        contract: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.brick-vault-gateway',
        functionName: 'deposit-sbtc',
        functionArgs: [arg],
        postConditions: [postCondition],
        network: 'devnet'
      })
      console.log('Deposit response:', response)

      if (!response.txid) {
        throw new Error('No transaction ID returned from deposit')
      }

      console.log('Deposit transaction ID:', response.txid)
      
      // Add to deposits list with pending status
      const depositId = Date.now().toString()
      setDeposits(prev => [{
        id: depositId,
        amount: `${depositAmount} ${depositToken}`,
        timestamp: Date.now(),
        status: 'pending',
        txHash: response.txid,
        oftusdcAmount: depositAmount
      }, ...prev])
      
      setDepositStep('success')
      
      // Refresh balances and reset form
      await refreshBalances()
      setDepositAmount('')
      
      alert(`Deposit transaction submitted! Transaction ID: ${response.txid}. We'll track the status automatically.`)
      
      // Start polling transaction status in the background
      pollTransactionStatus(response.txid, depositId).catch(error => {
        console.error('Error polling transaction status:', error)
      })
    } catch (error) {
      console.error('Deposit failed:', error)
      setDepositStep('error')
      alert('Deposit failed. Please try again.')
    }
  }

  // Copy address to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  // Check if contracts are properly configured
  const contractsConfigured = Object.values(CONTRACT_ADDRESSES).every(addr => addr && addr.length > 0)

  // Show loading state during hydration
  if (!isClient) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
              <h1 className="text-3xl font-bold text-foreground mb-4">Stacks Integration</h1>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!contractsConfigured) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
              <h1 className="text-3xl font-bold text-foreground mb-4">Configuration Required</h1>
              <p className="text-muted-foreground mb-4">Contract addresses are not configured.</p>
              <p className="text-muted-foreground mb-8">Please run the deployment script first:</p>
              <div className="bg-accent p-4 rounded-lg text-left max-w-md mx-auto">
                <code className="text-sm text-foreground">
                  cd packages/contracts-evm<br/>
                  npx hardhat run script/deploy-local.ts --network localhost
                </code>
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
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4 flex items-center justify-center gap-3">
            <Bitcoin className="h-10 w-10 text-orange-500" />
            Stacks Integration
          </h1>
          <p className="text-muted-foreground text-lg">
            Deposit STX or sBTC on Stacks and get OFTUSDC on EVM for property investments
          </p>
        </div>

        {/* Connection Status */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Connection Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stacks Connection */}
            <div className="bg-accent rounded-lg p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Bitcoin className="h-5 w-5 text-orange-500" />
                Stacks Network
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stacksConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-semibold">
                      {stacksConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                {stacksConnected && stacksAccount && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Address:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{stacksAccount.address.slice(0, 6)}...{stacksAccount.address.slice(-4)}</span>
                        <button
                          onClick={() => copyToClipboard(stacksAccount.address)}
                          className="p-1 hover:bg-accent rounded"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">STX Balance:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{stacksAccount.balance} STX</span>
                        <button
                          onClick={refreshBalances}
                          className="p-1 hover:bg-accent rounded"
                          title="Refresh balances"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">sBTC Balance:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{stacksAccount.sbtcBalance} sBTC</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {!stacksConnected ? (
                <button
                  onClick={connectStacksWallet}
                  className="w-full mt-3 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Connect Stacks Wallet
                </button>
              ) : (
                <button
                  onClick={disconnectStacksWallet}
                  className="w-full mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Disconnect Wallet
                </button>
              )}
            </div>

            {/* EVM Connection */}
            <div className="bg-accent rounded-lg p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                EVM Network
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isEvmConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-semibold">
                      {isEvmConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                {isEvmConnected && evmAddress && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Address:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{evmAddress.slice(0, 6)}...{evmAddress.slice(-4)}</span>
                      <button
                        onClick={() => copyToClipboard(evmAddress)}
                        className="p-1 hover:bg-accent rounded"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {!isEvmConnected && (
                <p className="text-sm text-muted-foreground mt-3">
                  Please connect your EVM wallet to continue
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Address Registration */}
        {stacksConnected && isEvmConnected && (
          <div className="bg-card rounded-lg border p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Link className="h-6 w-6 text-primary" />
              Address Registration
            </h2>
            
            {isCheckingRegistration ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  <p className="text-sm text-blue-800">Checking registration status...</p>
                </div>
              </div>
            ) : registeredEvmAddress ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                    <div className="text-sm text-green-800 flex-1">
                      <p className="font-medium">Already Registered</p>
                      <p className="mb-2">Your Stacks address is already registered with an EVM custodian address.</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-medium">EVM Custodian:</span>
                        <span className="font-mono text-xs bg-green-100 px-2 py-1 rounded">
                          {registeredEvmAddress.slice(0, 8)}...{registeredEvmAddress.slice(-6)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(registeredEvmAddress)}
                          className="p-1 hover:bg-green-200 rounded"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {!showUpdateForm ? (
                  <button
                    onClick={() => {
                      setShowUpdateForm(true)
                      setEvmCustodianAddress('')
                    }}
                    className="w-full py-2 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Update EVM Custodian Address</span>
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium">Update Custodian Address</p>
                          <p>Enter a new EVM address to receive OFTUSDC tokens from future deposits.</p>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        New EVM Custodian Address
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={evmCustodianAddress}
                          onChange={(e) => setEvmCustodianAddress(e.target.value)}
                          placeholder="Enter new EVM address"
                          className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                        />
                        <button
                          onClick={() => setEvmCustodianAddress(evmAddress || '')}
                          className="px-3 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors text-sm"
                        >
                          Use Current
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={updateEvmCustodian}
                        disabled={isRegistering || !evmCustodianAddress}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                          registrationStep === 'error'
                            ? 'bg-red-100 text-red-800'
                            : isRegistering
                            ? 'bg-blue-100 text-blue-800 cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {registrationStep === 'error' ? (
                          <>
                            <X className="h-4 w-4" />
                            <span>Update Failed</span>
                          </>
                        ) : isRegistering ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Updating...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4" />
                            <span>Update Address</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowUpdateForm(false)
                          setEvmCustodianAddress(registeredEvmAddress)
                          setRegistrationStep('success')
                        }}
                        disabled={isRegistering}
                        className="px-4 py-3 rounded-lg font-semibold transition-colors bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-orange-600 mt-0.5" />
                    <div className="text-sm text-orange-800">
                      <p className="font-medium">Registration Required</p>
                      <p>You need to register your Stacks address with an EVM custodian address before depositing STX or sBTC. This enables cross-chain OFTUSDC minting.</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      EVM Custodian Address
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={evmCustodianAddress}
                        onChange={(e) => setEvmCustodianAddress(e.target.value)}
                        placeholder="Enter EVM address to receive OFTUSDC"
                        className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                      />
                      <button
                        onClick={() => setEvmCustodianAddress(evmAddress || '')}
                        className="px-3 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors text-sm"
                      >
                        Use Current
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      This address will receive OFTUSDC tokens when you deposit sBTC
                    </p>
                  </div>
                  
                  <button
                    onClick={registerStacksAddress}
                    disabled={isRegistering || !evmCustodianAddress}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                      registrationStep === 'error'
                        ? 'bg-red-100 text-red-800'
                        : isRegistering
                        ? 'bg-blue-100 text-blue-800 cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {registrationStep === 'error' ? (
                      <>
                        <X className="h-4 w-4" />
                        <span>Registration Failed</span>
                      </>
                    ) : isRegistering ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Registering...</span>
                      </>
                    ) : (
                      <>
                        <Link className="h-4 w-4" />
                        <span>Register Addresses</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Deposit */}
        {stacksConnected && isEvmConnected && (registrationStep === 'success' || registeredEvmAddress) && (
          <div className="bg-card rounded-lg border p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Bitcoin className="h-6 w-6 text-primary" />
              Deposit Assets
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-accent rounded-lg p-4">
                <h3 className="font-semibold mb-3">Your STX Balance</h3>
                <p className="text-2xl font-bold text-blue-600">{stacksAccount?.balance || '0'} STX</p>
              </div>
              <div className="bg-accent rounded-lg p-4">
                <h3 className="font-semibold mb-3">Your sBTC Balance</h3>
                <p className="text-2xl font-bold text-orange-600">{stacksAccount?.sbtcBalance || '0'} sBTC</p>
              </div>
              <div className="bg-accent rounded-lg p-4">
                <h3 className="font-semibold mb-3">Minimum Deposit</h3>
                <p className="text-2xl font-bold text-foreground">{mockMinDeposit}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Select Token
                </label>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setDepositToken('sBTC')}
                    className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                      depositToken === 'sBTC'
                        ? 'bg-orange-600 text-white'
                        : 'bg-accent text-foreground hover:bg-accent/80'
                    }`}
                  >
                    sBTC
                  </button>
                  <button
                    onClick={() => setDepositToken('STX')}
                    className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                      depositToken === 'STX'
                        ? 'bg-blue-600 text-white'
                        : 'bg-accent text-foreground hover:bg-accent/80'
                    }`}
                  >
                    STX
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Amount ({depositToken})
                </label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                  placeholder={`Enter ${depositToken} amount`}
                  step="0.000001"
                  min="0"
                />
                {depositAmount && (
                  <p className="text-sm text-muted-foreground mt-1">
                    You will receive approximately {depositAmount} OFTUSDC (1:1 conversion)
                  </p>
                )}
              </div>
              
              <button
                onClick={depositAsset}
                disabled={depositStep === 'depositing' || !depositAmount || parseFloat(depositAmount) < parseFloat(mockMinDeposit)}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                  depositStep === 'success'
                    ? 'bg-green-100 text-green-800'
                    : depositStep === 'error'
                    ? 'bg-red-100 text-red-800'
                    : depositStep === 'depositing'
                    ? 'bg-blue-100 text-blue-800 cursor-not-allowed'
                    : depositToken === 'sBTC'
                    ? 'bg-orange-600 text-white hover:bg-orange-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {depositStep === 'success' ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Deposit Successful!</span>
                  </>
                ) : depositStep === 'error' ? (
                  <>
                    <X className="h-4 w-4" />
                    <span>Deposit Failed</span>
                  </>
                ) : depositStep === 'depositing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing Deposit...</span>
                  </>
                ) : (
                  <>
                    <Bitcoin className="h-4 w-4" />
                    <span>Deposit {depositToken}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Platform Statistics */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Platform Statistics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-accent p-4 rounded-lg">
              <h3 className="font-semibold text-foreground">Total Value Locked</h3>
              <p className="text-2xl font-bold text-orange-600">${mockTotalLocked}M</p>
            </div>
            <div className="bg-accent p-4 rounded-lg">
              <h3 className="font-semibold text-foreground">Total Deposits</h3>
              <p className="text-2xl font-bold text-primary">{deposits.length}</p>
            </div>
            <div className="bg-accent p-4 rounded-lg">
              <h3 className="font-semibold text-foreground">Active Users</h3>
              <p className="text-2xl font-bold text-green-600">1,247</p>
            </div>
          </div>
        </div>

        {/* Deposit History */}
        {deposits.length > 0 && (
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Deposit History
            </h2>
            <div className="space-y-4">
              {deposits.map((deposit) => (
                <div key={deposit.id} className="bg-accent rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bitcoin className="h-4 w-4 text-orange-500" />
                      <span className="font-semibold">{deposit.amount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${
                        deposit.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        deposit.status === 'minted' ? 'bg-blue-100 text-blue-800' :
                        deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {deposit.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {deposit.status}
                      </span>
                      {deposit.status === 'pending' && deposit.txHash && (
                        <button
                          onClick={() => {
                            pollTransactionStatus(deposit.txHash!, deposit.id).catch(console.error)
                          }}
                          className="p-1 hover:bg-accent rounded"
                          title="Refresh status"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p className="font-semibold">{new Date(deposit.timestamp).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">OFTUSDC:</span>
                      <p className="font-semibold">{deposit.oftusdcAmount} OFTUSDC</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tx Hash:</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">{deposit.txHash?.slice(0, 8)}...</span>
                        <button
                          onClick={() => copyToClipboard(deposit.txHash || '')}
                          className="p-1 hover:bg-accent rounded"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <a
                          href={`http://localhost:3999/extended/v1/tx/${deposit.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-accent rounded"
                          title="View transaction"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time:</span>
                      <p className="font-semibold">{new Date(deposit.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-card rounded-lg border p-6 mt-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bitcoin className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="font-semibold mb-2">1. Deposit Assets</h3>
              <p className="text-sm text-muted-foreground">
                Connect your Stacks wallet and deposit STX or sBTC to the BrickVault gateway contract
              </p>
            </div>
            <div className="text-center">
              <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Link className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold mb-2">2. Cross-Chain Mint</h3>
              <p className="text-sm text-muted-foreground">
                Our relayer automatically mints OFTUSDC tokens on EVM to your custodian address
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-semibold mb-2">3. Invest in Properties</h3>
              <p className="text-sm text-muted-foreground">
                Use your OFTUSDC to invest in tokenized real estate properties on the platform
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

