'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, pad } from 'viem'
import { MOCK_USDC_ABI, OFT_USDC_ABI, USDC_OFT_ADAPTER_ABI, PROPERTY_VAULT_GOVERNANCE_ABI, STACKS_CROSS_CHAIN_MANAGER_ABI } from '@brickvault/abi'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS, LAYERZERO_CONFIG, STACKS_CONFIG } from '../../config/contracts'
import { Header } from '@/components/Header'
import { 
  ArrowRight, 
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
import { connect, disconnect, isConnected, request as stacksRequest } from '@stacks/connect'
import { 
  Cl, 
  uintCV,
  Pc
} from '@stacks/transactions'

// Extract ABIs - some are artifacts with .abi property, some are plain arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractAbi = (abiOrArtifact: any) => abiOrArtifact?.abi || abiOrArtifact
const MOCK_USDC_ABI_ARRAY = extractAbi(MOCK_USDC_ABI)
const USDC_OFT_ADAPTER_ABI_ARRAY = extractAbi(USDC_OFT_ADAPTER_ABI)
const OFT_USDC_ABI_ARRAY = extractAbi(OFT_USDC_ABI)
const PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY = extractAbi(PROPERTY_VAULT_GOVERNANCE_ABI)

// Contract addresses from generated config (Unified Adapter Architecture)
const CONTRACTS = {
  MockUSDCHub: CONTRACT_ADDRESSES.MockUSDCHub,
  MockUSDCSpoke: CONTRACT_ADDRESSES.MockUSDCSpoke,
  USDCOFTAdapterHub: CONTRACT_ADDRESSES.USDCOFTAdapterHub,
  USDCOFTAdapterSpoke: CONTRACT_ADDRESSES.USDCOFTAdapterSpoke,
  OFTUSDC: CONTRACT_ADDRESSES.OFTUSDC,
  PropertyVault: CONTRACT_ADDRESSES.PropertyVault,
}

// Stacks account interface
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

type TabType = 'hub' | 'spoke' | 'stacks'

export default function BalancePage() {
  const { address: evmAddress, isConnected: isEvmConnected, chainId } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  // Note: useWaitForTransactionReceipt automatically tracks on the chain where the transaction was submitted
  // So BSC transactions are tracked on BSC, Sepolia transactions on Sepolia
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })
  const publicClient = usePublicClient()
  
  // Chain detection
  const SEPOLIA_CHAIN_ID = 11155111
  const BNB_TESTNET_CHAIN_ID = 97
  const isOnSepoliaChain = chainId === SEPOLIA_CHAIN_ID
  const isOnBnbTestnetChain = chainId === BNB_TESTNET_CHAIN_ID
  
  // Handle hydration by tracking if we're on the client
  const [isClient, setIsClient] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('hub')
  
  // Stacks wallet state
  const [stacksAccount, setStacksAccount] = useState<StacksAccount | null>(null)
  const [stacksConnected, setStacksConnected] = useState(false)
  
  // Load Stacks account from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAccount = localStorage.getItem('stacksAccount')
      if (savedAccount) {
        try {
          const account = JSON.parse(savedAccount)
          setStacksAccount(account)
          setStacksConnected(true)
          
          // Check registration status
          checkRegistrationStatus(account.address).catch(console.error)
        } catch (error) {
          console.error('Failed to parse saved Stacks account:', error)
          localStorage.removeItem('stacksAccount')
        }
      }
    }
  }, [])
  
  // Registration state
  const [evmCustodianAddress, setEvmCustodianAddress] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [registrationStep, setRegistrationStep] = useState<'idle' | 'registering' | 'success' | 'error'>('idle')
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false)
  const [registeredEvmAddress, setRegisteredEvmAddress] = useState<string | null>(null)
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  
  // Stacks Deposit state
  const [depositAmount, setDepositAmount] = useState('')
  const [depositStep, setDepositStep] = useState<'idle' | 'depositing' | 'success' | 'error'>('idle')
  const [deposits, setDeposits] = useState<StacksDeposit[]>([])
  
  // EVM state (Hub chain)
  const [usdcAmount, setUsdcAmount] = useState('')
  const [oftAmount, setOftAmount] = useState('')
  const [quotingFee, setQuotingFee] = useState(false)
  const [approvalStep, setApprovalStep] = useState<'idle' | 'approving' | 'approved' | 'sending'>('idle')
  const [hubUnwrapStep, setHubUnwrapStep] = useState<'idle' | 'quoting' | 'sending'>('idle')
  const [showRelayNotice, setShowRelayNotice] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Spoke chain state
  const [spokeUsdcAmount, setSpokeUsdcAmount] = useState('')
  const [spokeApprovalStep, setSpokeApprovalStep] = useState<'idle' | 'approving' | 'approved' | 'sending'>('idle')
  const [spokeQuotingFee, setSpokeQuotingFee] = useState(false)
  const [spokeOftAmount, setSpokeOftAmount] = useState('')
  const [spokeQuotingUnwrapFee, setSpokeQuotingUnwrapFee] = useState(false)
  const [spokeUnwrapStep, setSpokeUnwrapStep] = useState<'idle' | 'quoting' | 'sending'>('idle')
  
  // Track approval transaction separately
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>()
  const [approvalChainId, setApprovalChainId] = useState<number | undefined>()
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } = useWaitForTransactionReceipt({
    hash: approvalHash,
    chainId: approvalChainId,
  })
  
  // Manual transaction tracking for spoke chain (BSC)
  const [isManuallyConfirming, setIsManuallyConfirming] = useState(false)
  const [isManuallyConfirmed, setIsManuallyConfirmed] = useState(false)
  const [isManuallyConfirmingApproval, setIsManuallyConfirmingApproval] = useState(false)
  const [isManuallyConfirmedApproval, setIsManuallyConfirmedApproval] = useState(false)
  
  // Reset manual flags when wagmi confirms (for hub chain)
  useEffect(() => {
    if (isConfirmed) {
      setIsManuallyConfirming(false)
      setIsManuallyConfirmed(false)
    }
    if (isApprovalConfirmed) {
      setIsManuallyConfirmingApproval(false)
      setIsManuallyConfirmedApproval(false)
    }
  }, [isConfirmed, isApprovalConfirmed])
  
  // Manual polling for BSC transactions only
  useEffect(() => {
    // Only use manual polling for BSC transactions
    if (!hash || !chainId || chainId !== BNB_TESTNET_CHAIN_ID) return
    if (isManuallyConfirmed) return
    
    // Don't poll if we're not in a sending state
    if (approvalStep !== 'sending' && spokeApprovalStep !== 'sending') return
    
    setIsManuallyConfirming(true)
    
    let cancelled = false
    let intervalId: NodeJS.Timeout | null = null
    
    const checkReceipt = async () => {
      if (cancelled) return
      try {
        const rpcUrl = chainId === BNB_TESTNET_CHAIN_ID
          ? (process.env.NEXT_PUBLIC_SPOKE_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545')
          : (process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545')
        
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [hash],
            id: 1
          })
        })
        
        const result = await response.json()
        
        if (cancelled) return
        
        if (result.result && result.result.status === '0x1') {
          // Clear the hash to stop polling
          cancelled = true
          setIsManuallyConfirming(false)
          setIsManuallyConfirmed(true)
          
          // Update state based on which step we're in
          if (spokeApprovalStep === 'sending') {
            setSpokeApprovalStep('idle')
            setShowRelayNotice(true)
            setTimeout(() => refreshAllBalances(), 1000)
          }
          
          // Stop the interval
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        // If still pending, the interval will check again in 3 seconds
      } catch (error) {
        console.error('Error checking receipt:', error)
        // The interval will retry in 3 seconds
      }
    }
    
    // Start checking after 2 seconds, then every 3 seconds
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        checkReceipt()
        intervalId = setInterval(checkReceipt, 3000)
      }
    }, 2000)
    
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
      setIsManuallyConfirming(false)
    }
  }, [hash, chainId, isManuallyConfirmed, approvalStep, spokeApprovalStep])
  
  // Manual polling for BSC approval transactions
  useEffect(() => {
    // Only use manual polling for BSC approvals
    if (!approvalHash || !approvalChainId || approvalChainId !== BNB_TESTNET_CHAIN_ID) return
    if (isManuallyConfirmedApproval) return
    
    setIsManuallyConfirmingApproval(true)
    
    let cancelled = false
    let intervalId: NodeJS.Timeout | null = null
    
    const checkReceipt = async () => {
      try {
        const rpcUrl = approvalChainId === BNB_TESTNET_CHAIN_ID
          ? (process.env.NEXT_PUBLIC_SPOKE_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545')
          : (process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545')
        
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [approvalHash],
            id: 1
          })
        })
        
        const result = await response.json()
        
        if (cancelled) return
        
        if (result.result && result.result.status === '0x1') {
          // Stop polling
          cancelled = true
          setIsManuallyConfirmingApproval(false)
          setIsManuallyConfirmedApproval(true)
          
          // Trigger the spoke approval flow only
          if (spokeApprovalStep === 'approving') {
            setSpokeApprovalStep('approved')
            fetchSpokeUsdcAllowance()
            setTimeout(() => sendSpokeUSDCCrossChain(), 100)
          }
          setApprovalHash(undefined)
          setApprovalChainId(undefined)
          
          // Stop the interval
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
        // If still pending, the interval will check again in 3 seconds
      } catch (error) {
        console.error('Error checking approval receipt:', error)
        // The interval will retry in 3 seconds
      }
    }
    
    // Start checking immediately, then every 3 seconds
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        checkReceipt()
        intervalId = setInterval(checkReceipt, 3000)
      }
    }, 1000) // Check after 1 second for approvals (faster)
    
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
      setIsManuallyConfirmingApproval(false)
    }
  }, [approvalHash, approvalChainId, isManuallyConfirmedApproval, approvalStep, spokeApprovalStep])
  
  // Configuration for local devnet
  // NOTE: Contract uses 8 decimals for sBTC (min-deposit-amount is u10000000 for 0.1 sBTC)
  const [mockMinDeposit] = useState('0.1') // 0.1 sBTC minimum
  const [mockTotalLocked] = useState('15.7') // Mock total value locked

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Log errors from writeContract
  useEffect(() => {
    if (error) {
      console.error('writeContract error:', error)
    }
  }, [error])
  
  // Reset manual confirmation flags when starting new transactions
  useEffect(() => {
    if (isPending) {
      setIsManuallyConfirmed(false)
      setIsManuallyConfirmedApproval(false)
    }
  }, [isPending])

  // Track approval transaction hash when it's created
  useEffect(() => {
    if (hash && (approvalStep === 'approving' || spokeApprovalStep === 'approving')) {
      setApprovalHash(hash)
      setApprovalChainId(chainId) // Track which chain the approval is on
    }
  }, [hash, approvalStep, spokeApprovalStep, chainId])

  // Auto-trigger adapter send after approval is confirmed (Hub chain)
  useEffect(() => {
    if (isApprovalConfirmed && approvalStep === 'approving') {
      setApprovalStep('approved')
      setApprovalHash(undefined)
      setApprovalChainId(undefined)
      setTimeout(() => {
        sendUSDCViaAdapter()
      }, 100)
    }
  }, [isApprovalConfirmed, approvalStep])

  // Auto-trigger cross-chain send after spoke approval is confirmed
  // Note: For BSC transactions, manual polling handles this automatically
  // This effect only runs if wagmi somehow confirms a BSC approval (fallback)
  useEffect(() => {
    if (isApprovalConfirmed && spokeApprovalStep === 'approving' && approvalChainId !== BNB_TESTNET_CHAIN_ID) {
      setSpokeApprovalStep('approved')
      setApprovalHash(undefined)
      setApprovalChainId(undefined)
      fetchSpokeUsdcAllowance()
      setTimeout(() => {
        sendSpokeUSDCCrossChain()
      }, 100)
    }
  }, [isApprovalConfirmed, spokeApprovalStep, approvalChainId])

  // Reset approval step when transaction is completed or there's an error
  useEffect(() => {
    // Hub chain wrap/unwrap transactions (confirmed by wagmi)
    if (isConfirmed && chainId !== BNB_TESTNET_CHAIN_ID) {
      if (approvalStep === 'sending') {
        setApprovalStep('idle')
        setApprovalHash(undefined)
        setShowRelayNotice(true)
        setTimeout(() => refreshAllBalances(), 2000)
      }
      if (hubUnwrapStep === 'sending') {
        setHubUnwrapStep('idle')
        setShowRelayNotice(true)
        setTimeout(() => refreshAllBalances(), 2000)
      }
      if (spokeUnwrapStep === 'sending') {
        setSpokeUnwrapStep('idle')
        setShowRelayNotice(true)
        setTimeout(() => refreshAllBalances(), 2000)
      }
    }
    
    // Spoke chain transactions are handled by manual polling, not this effect
    // (Manual polling already sets spokeApprovalStep to 'idle' when confirmed)
    
    if (error) {
      setApprovalStep('idle')
      setSpokeApprovalStep('idle')
      setHubUnwrapStep('idle')
      setSpokeUnwrapStep('idle')
      setApprovalHash(undefined)
      setApprovalChainId(undefined)
      setIsManuallyConfirming(false)
      setIsManuallyConfirmed(false)
      setIsManuallyConfirmingApproval(false)
      setIsManuallyConfirmedApproval(false)
    }
  }, [isConfirmed, error, approvalStep, hubUnwrapStep, spokeUnwrapStep, chainId])

  // Read user balances (Hub chain)
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: CONTRACTS.MockUSDCHub as `0x${string}`,
    abi: MOCK_USDC_ABI_ARRAY,
    functionName: 'balanceOf',
    args: evmAddress ? [evmAddress] : undefined,
  })

  const { data: oftBalance, refetch: refetchOftBalance } = useReadContract({
    address: CONTRACTS.OFTUSDC as `0x${string}`,
    abi: OFT_USDC_ABI_ARRAY,
    functionName: 'balanceOf',
    args: evmAddress ? [evmAddress] : undefined,
  })

  const { data: vaultBalance, refetch: refetchVaultBalance } = useReadContract({
    address: CONTRACTS.PropertyVault as `0x${string}`,
    abi: PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY,
    functionName: 'balanceOf',
    args: evmAddress ? [evmAddress] : undefined,
  })

  // Spoke chain balance state (manually fetched since it's on a different chain)
  const [spokeUsdcBalance, setSpokeUsdcBalance] = useState<bigint>(BigInt(0))
  const [isFetchingSpokeBalance, setIsFetchingSpokeBalance] = useState(false)

  // Fetch spoke chain USDC balance (cross-chain call)
  const fetchSpokeUsdcBalance = async () => {
    if (!evmAddress || !CONTRACTS.MockUSDCSpoke) return
    
    try {
      setIsFetchingSpokeBalance(true)
      
      // Encode balanceOf(address) call
      const balanceOfSelector = '0x70a08231' // balanceOf(address)
      const paddedAddress = evmAddress.slice(2).padStart(64, '0')
      const data = balanceOfSelector + paddedAddress
      
      // Call spoke chain RPC
      const response = await fetch(process.env.NEXT_PUBLIC_SPOKE_RPC_URL || 'http://localhost:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: CONTRACTS.MockUSDCSpoke,
            data: data
          }, 'latest'],
          id: 1
        })
      })
      
      const result = await response.json()
      
      if (result.result) {
        const balance = BigInt(result.result)
        setSpokeUsdcBalance(balance)
      }
    } catch (error) {
      console.error('Error fetching spoke USDC balance:', error)
      setSpokeUsdcBalance(BigInt(0))
    } finally {
      setIsFetchingSpokeBalance(false)
    }
  }

  // Fetch spoke balance on mount and when address changes
  useEffect(() => {
    if (evmAddress && isClient) {
      fetchSpokeUsdcBalance()
    }
  }, [evmAddress, isClient])

  // Refresh all balances
  const refreshAllBalances = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        refetchUsdcBalance(),
        refetchOftBalance(),
        refetchVaultBalance(),
        fetchSpokeUsdcBalance(),
        fetchSpokeUsdcAllowance(),
      ])
    } catch (error) {
      console.error('Error refreshing balances:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Read allowances for USDCOFTAdapterHub
  const { data: usdcAllowance } = useReadContract({
    address: CONTRACTS.MockUSDCHub as `0x${string}`,
    abi: MOCK_USDC_ABI_ARRAY,
    functionName: 'allowance',
    args: evmAddress ? [evmAddress, CONTRACTS.USDCOFTAdapterHub as `0x${string}`] : undefined,
  })

  // Spoke chain allowance state (manually fetched since it's on a different chain)
  const [spokeUsdcAllowance, setSpokeUsdcAllowance] = useState<bigint>(BigInt(0))

  // Fetch spoke chain USDC allowance (cross-chain call)
  const fetchSpokeUsdcAllowance = async () => {
    if (!evmAddress || !CONTRACTS.MockUSDCSpoke || !CONTRACTS.USDCOFTAdapterSpoke) return
    
    try {
      // Encode allowance(address,address) call
      const allowanceSelector = '0xdd62ed3e' // allowance(address,address)
      const paddedOwner = evmAddress.slice(2).padStart(64, '0')
      const paddedSpender = CONTRACTS.USDCOFTAdapterSpoke.slice(2).padStart(64, '0')
      const data = allowanceSelector + paddedOwner + paddedSpender
      
      // Call spoke chain RPC
      const response = await fetch(process.env.NEXT_PUBLIC_SPOKE_RPC_URL || 'http://localhost:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: CONTRACTS.MockUSDCSpoke,
            data: data
          }, 'latest'],
          id: 1
        })
      })
      
      const result = await response.json()
      
      if (result.result) {
        const allowance = BigInt(result.result)
        setSpokeUsdcAllowance(allowance)
      }
    } catch (error) {
      console.error('Error fetching spoke USDC allowance:', error)
      setSpokeUsdcAllowance(BigInt(0))
    }
  }

  // Fetch spoke allowance on mount and when address changes
  useEffect(() => {
    if (evmAddress && isClient) {
      fetchSpokeUsdcAllowance()
    }
  }, [evmAddress, isClient])

  // Read sBTC price from StacksCrossChainManager
  const { data: sbtcPriceData } = useReadContract({
    address: CONTRACT_ADDRESSES.StacksCrossChainManager as `0x${string}`,
    abi: extractAbi(STACKS_CROSS_CHAIN_MANAGER_ABI),
    functionName: 'getSbtcPrice',
  })

  // Convert sBTC price from contract (8 decimals) to number
  // getSbtcPrice returns tuple: (price, isValid)
  const SBTC_PRICE_USD = sbtcPriceData ? parseFloat(formatUnits((sbtcPriceData as [bigint, boolean])[0], 8)) : 95000

  // ===== STACKS FUNCTIONS =====

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
    
    const accountData = {
      address: stxAddress,
      balance: stxBalance,
      sbtcBalance: sbtcBalance,
      isConnected: true,
      btcAddress: btcAddress || '',
      publicKey: publicKey
    }
    
    setStacksAccount(accountData)
    setStacksConnected(true)
    
    // Save to localStorage for cross-page persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('stacksAccount', JSON.stringify(accountData))
    }
    
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
      const response = await connect()
      
      if (response?.addresses && Array.isArray(response.addresses)) {
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

  // Disconnect Stacks wallet
  const disconnectStacksWallet = () => {
    disconnect()
    setStacksAccount(null)
    setStacksConnected(false)
    setRegistrationStep('idle')
    
    // Remove from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('stacksAccount')
    }
    
    console.log('User disconnected')
  }

  // Fetch real STX balance from Stacks API
  const fetchStxBalance = async (address: string): Promise<string> => {
    try {
      const response = await fetch(`${STACKS_CONFIG.apiUrl}/v2/accounts/${address}`)
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
      const response = await fetch(`${STACKS_CONFIG.apiUrl}/extended/v2/addresses/${address}/balances/ft`)
      const data = await response.json()
      
      if (data.results && Array.isArray(data.results)) {
        const sbtcToken = data.results.find((token: { token: string; balance: string }) => 
          token.token.includes('sbtc-token') || token.token.includes('sbtc')
        )
        
        if (sbtcToken?.balance) {
          return (parseInt(sbtcToken.balance) / 100_000_000).toFixed(8)
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
      const response = await fetch(`${STACKS_CONFIG.explorerUrl}/tx/${txid}`)
      const data = await response.json()
      
      console.log('Transaction status:', data.tx_status)
      
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
      
      setDeposits(prev => prev.map(dep => 
        dep.id === depositId ? { ...dep, status } : dep
      ))
      
      if (status === 'confirmed') {
        console.log('✅ Transaction confirmed!')
        setTimeout(() => {
          setDeposits(prev => prev.map(dep => 
            dep.id === depositId ? { ...dep, status: 'minted' } : dep
          ))
        }, 3000)
        return 'confirmed'
      } else if (status === 'failed') {
        console.log('❌ Transaction failed!')
        return 'failed'
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.warn('Transaction polling timed out')
    return 'pending'
  }

  // Check if Stacks address is already registered
  const checkRegistrationStatus = async (stacksAddress: string) => {
    setIsCheckingRegistration(true)
    try {
      const principalCv = Cl.principal(stacksAddress)
      const { cvToHex } = await import('@stacks/transactions')
      const principalHex = cvToHex(principalCv)
      
      const [contractAddress, contractName] = STACKS_CONFIG.gatewayContract.split('.')
      
      const response = await fetch(
        `${STACKS_CONFIG.apiUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/get-evm-custodian`,
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
      
      if (!response.ok) {
        const errorText = await response.text()
        console.warn('Failed to check registration status:', response.status, errorText)
        setRegisteredEvmAddress(null)
        setRegistrationStep('idle')
        return null
      }
      
      const data = await response.json()
      
      if (data.okay && data.result) {
        const resultHex = data.result
        
        if (resultHex.includes('0a')) {
          const bufferStart = resultHex.indexOf('0200000014')
          if (bufferStart !== -1) {
            const evmAddressHex = resultHex.slice(bufferStart + 10, bufferStart + 10 + 40)
            const evmAddress = `0x${evmAddressHex}`
            
            setRegisteredEvmAddress(evmAddress)
            setEvmCustodianAddress(evmAddress)
            setRegistrationStep('success')
            return evmAddress
          }
        }
      }
      
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

    if (!evmCustodianAddress.startsWith('0x') || evmCustodianAddress.length !== 42) {
      alert('Please provide a valid EVM address (0x followed by 40 hex characters)')
      return
    }

    setIsRegistering(true)
    setRegistrationStep('registering')

    try {
      const evmAddressHex = evmCustodianAddress.slice(2)
      const evmAddressBuffer = Cl.buffer(Buffer.from(evmAddressHex, 'hex'))
      
      const response = await stacksRequest('stx_callContract', {
        contract: STACKS_CONFIG.gatewayContract as `${string}.${string}`,
        functionName: 'register-stacks-address',
        functionArgs: [evmAddressBuffer],
        network: STACKS_CONFIG.network
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

    if (!evmCustodianAddress.startsWith('0x') || evmCustodianAddress.length !== 42) {
      alert('Please provide a valid EVM address (0x followed by 40 hex characters)')
      return
    }

    if (evmCustodianAddress === registeredEvmAddress) {
      alert('The new address is the same as the current one')
      return
    }

    setIsRegistering(true)
    setRegistrationStep('registering')

    try {
      const evmAddressHex = evmCustodianAddress.slice(2)
      const evmAddressBuffer = Cl.buffer(Buffer.from(evmAddressHex, 'hex'))
      
      const response = await stacksRequest('stx_callContract', {
        contract: STACKS_CONFIG.gatewayContract as `${string}.${string}`,
        functionName: 'update-evm-custodian',
        functionArgs: [evmAddressBuffer],
        network: STACKS_CONFIG.network
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

  // Deposit sBTC tokens
  const depositAsset = async () => {
    if (!depositAmount || !stacksAccount?.address) {
      alert('Please enter amount and ensure Stacks wallet is connected')
      return
    }

    const amount = parseFloat(depositAmount)
    
    if (amount < parseFloat(mockMinDeposit)) {
      alert(`Minimum deposit amount is ${mockMinDeposit} sBTC`)
      return  
    }

    // Pre-check: Verify pool liquidity before attempting deposit
    try {
      const [contractAddress, contractName] = STACKS_CONFIG.gatewayContract.split('.')
      
      // Get pool amount (USD with 6 decimals)
      const poolResponse = await fetch(
        `${STACKS_CONFIG.apiUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/get-pool-amount-usd`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: stacksAccount.address,
            arguments: []
          })
        }
      )
      
      if (poolResponse.ok) {
        const poolData = await poolResponse.json()
        
        if (poolData.okay && poolData.result) {
          const resultHex = poolData.result
          // Parse the uint result from hex
          // Clarity serialization: 0x07 = some, 01 = uint type prefix
          // Remove 0x0701 prefix and parse the remaining hex as the uint value
          const cleanHex = resultHex.replace('0x0701', '')
          const poolAmountUsd = parseInt(cleanHex, 16)
          
          // Calculate required USD (amount in sBTC * price per sBTC)
          // sBTC amount with 8 decimals, price with 8 decimals, result in 6 decimals
          const amountMicro = Math.floor(amount * 100000000) // 8 decimals
          const requiredUsd = Math.floor((amountMicro * SBTC_PRICE_USD) / 100000000) // Convert to 6 decimals
          
          if (poolAmountUsd < requiredUsd) {
            alert(
              `⚠️ Insufficient Pool Liquidity!\n\n` +
              `Required: $${(requiredUsd / 1000000).toFixed(2)} USD\n` +
              `Available: $${(poolAmountUsd / 1000000).toFixed(2)} USD\n\n` +
              `The pool doesn't have enough liquidity for this deposit.\n` +
              `Please try a smaller amount or contact the platform administrator.`
            )
            return
          }
        }
      }
      
      // Get contract paused status
      const pausedResponse = await fetch(
        `${STACKS_CONFIG.apiUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/is-contract-paused`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: stacksAccount.address,
            arguments: []
          })
        }
      )
      
      if (pausedResponse.ok) {
        const pausedData = await pausedResponse.json()
        
        if (pausedData.okay && pausedData.result) {
          const isPaused = pausedData.result.includes('0x03') // true in Clarity
          
          if (isPaused) {
            alert('⚠️ Contract is currently paused. Deposits are not allowed at this time.')
            return
          }
        }
      }
      
      // Check if user has sBTC from the correct contract
      const ftBalancesResponse = await fetch(
        `${STACKS_CONFIG.apiUrl}/extended/v2/addresses/${stacksAccount.address}/balances/ft`
      )
      
      if (ftBalancesResponse.ok) {
        const ftData = await ftBalancesResponse.json()
        const expectedTokenId = `${STACKS_CONFIG.sbtcTokenContract}::sbtc-token`
        
        const userHasCorrectToken = ftData.results?.some((token: { token: string; balance: string }) => 
          token.token === expectedTokenId
        )
        
        if (!userHasCorrectToken) {
          const availableTokens = ftData.results?.filter((t: { token: string }) => 
            t.token.includes('sbtc')
          ).map((t: { token: string; balance: string }) => `${t.token} (${(parseInt(t.balance) / 100000000).toFixed(8)} sBTC)`)
          
          alert(
            `⚠️ Wrong sBTC Token Contract!\n\n` +
            `Expected: ${expectedTokenId}\n\n` +
            `You have sBTC from:\n${availableTokens?.join('\n') || 'No sBTC tokens found'}\n\n` +
            `The gateway contract expects sBTC from the deployed contract.\n` +
            `Please acquire sBTC from the correct contract or update the configuration.`
          )
          return
        }
      }
    } catch (error) {
      console.warn('Error during pre-checks:', error)
    }

    setDepositStep('depositing')

    try {
      const amountMicro = Math.floor(amount * 100000000)
      const arg = uintCV(amountMicro);
      
      // Post-condition: User will send exactly `amount` of sbtc-token to the contract
      // The contract receives the tokens, so we specify willSendEq (exact amount)
      const postCondition = Pc.principal(stacksAccount.address)
        .willSendEq(amountMicro)
        .ft(STACKS_CONFIG.sbtcTokenContract as `${string}.${string}`, 'sbtc-token');
      
      const response = await stacksRequest('stx_callContract', {
        contract: STACKS_CONFIG.gatewayContract as `${string}.${string}`,
        functionName: 'deposit-sbtc',
        functionArgs: [arg],
        postConditions: [postCondition],
        network: STACKS_CONFIG.network
      })

      if (!response.txid) {
        throw new Error('No transaction ID returned from deposit')
      }
      
      const depositId = Date.now().toString()
      const expectedOFTUSDC = (parseFloat(depositAmount) * SBTC_PRICE_USD).toLocaleString()
      
      setDeposits(prev => [{
        id: depositId,
        amount: `${depositAmount} sBTC`,
        timestamp: Date.now(),
        status: 'pending',
        txHash: response.txid,
        oftusdcAmount: expectedOFTUSDC
      }, ...prev])
      
      setDepositStep('success')
      
      await refreshBalances()
      
      setDepositAmount('')
      
      alert(`sBTC deposit transaction submitted! Transaction ID: ${response.txid}. We'll track the status automatically.`)
      
      pollTransactionStatus(response.txid, depositId).catch(error => {
        console.error('Error polling transaction status:', error)
      })
    } catch (error) {
      console.error('Deposit failed:', error)
      setDepositStep('error')
      alert(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ===== EVM FUNCTIONS =====

  // Combined function: Approve USDC then send via adapter (same-chain wrapping)
  const approveAndSendUSDC = async () => {
    if (!usdcAmount || !evmAddress || !publicClient) return
    
    const amount = parseUnits(usdcAmount, TOKEN_DECIMALS.USDC)
    
    const currentAllowance = usdcAllowance as bigint || BigInt(0)
    if (currentAllowance >= amount) {
      setApprovalStep('sending')
      await sendUSDCViaAdapter()
      return
    }
    
    setApprovalStep('approving')
    writeContract({
      address: CONTRACTS.MockUSDCHub as `0x${string}`,
      abi: MOCK_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.USDCOFTAdapterHub as `0x${string}`, amount],
      gas: BigInt(100000),
    })
  }

  // Send USDC via USDCOFTAdapterHub to get OFTUSDC (same-chain wrapping)
  const sendUSDCViaAdapter = async () => {
    if (!usdcAmount || !evmAddress || !publicClient) return
    
    try {
      setApprovalStep('sending')
      setQuotingFee(true)
      const amount = parseUnits(usdcAmount, TOKEN_DECIMALS.USDC)
      
      const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex()
        .toString()
      
      const sendParamTuple = {
        dstEid: LAYERZERO_CONFIG.hubEID, // Same chain (hub to hub)
        to: pad(evmAddress, { size: 32 }),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: options as `0x${string}`,
        composeMsg: '0x' as `0x${string}`,
        oftCmd: '0x' as `0x${string}`,
      }
      
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.USDCOFTAdapterHub as `0x${string}`,
          abi: USDC_OFT_ADAPTER_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParamTuple, false],
        })
        
        if (typeof quoteResult === 'object' && quoteResult !== null && 'nativeFee' in quoteResult) {
          nativeFee = (quoteResult as { nativeFee: bigint }).nativeFee
        } else if (Array.isArray(quoteResult)) {
          nativeFee = quoteResult[0] as bigint
        } else {
          nativeFee = quoteResult as bigint
        }
      } catch (quoteError) {
        nativeFee = BigInt(1000000000000000)
      }
      
      setQuotingFee(false)
      
      const feeTuple = {
        nativeFee: nativeFee,
        lzTokenFee: BigInt(0),
      }
      
      writeContract({
        address: CONTRACTS.USDCOFTAdapterHub as `0x${string}`,
        abi: USDC_OFT_ADAPTER_ABI_ARRAY,
        functionName: 'send',
        args: [sendParamTuple, feeTuple, evmAddress],
        value: nativeFee,
        gas: BigInt(10000000),
      })
    } catch (err) {
      console.error('Error sending via adapter:', err)
      setQuotingFee(false)
    }
  }

  // Unwrap OFTUSDC back to USDC (same-chain unwrapping via adapter)
  const redeemOFTUSDCToUSDC = async () => {
    if (!oftAmount || !evmAddress || !publicClient) return
    
    try {
      setHubUnwrapStep('quoting')
      setQuotingFee(true)
      const amount = parseUnits(oftAmount, TOKEN_DECIMALS.OFTUSDC)
      
      // Check if user has enough balance
      const currentBalance = oftBalance as bigint || BigInt(0)
      if (amount > currentBalance) {
        alert(`Insufficient OFTUSDC balance. You have ${formatUnits(currentBalance, TOKEN_DECIMALS.OFTUSDC)} but trying to unwrap ${oftAmount}`)
        setQuotingFee(false)
        setHubUnwrapStep('idle')
        return
      }
      
      const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex()
        .toString()
      
      const sendParamTuple = {
        dstEid: LAYERZERO_CONFIG.hubEID, // Same chain (hub to hub) to unwrap
        to: pad(evmAddress, { size: 32 }),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: options as `0x${string}`,
        composeMsg: '0x' as `0x${string}`,
        oftCmd: '0x' as `0x${string}`,
      }
      
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.OFTUSDC as `0x${string}`,
          abi: OFT_USDC_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParamTuple, false],
        })
        
        if (typeof quoteResult === 'object' && quoteResult !== null && 'nativeFee' in quoteResult) {
          nativeFee = (quoteResult as { nativeFee: bigint }).nativeFee
        } else if (Array.isArray(quoteResult)) {
          nativeFee = quoteResult[0] as bigint
        } else {
          nativeFee = quoteResult as bigint
        }
      } catch (quoteError) {
        nativeFee = BigInt(1000000000000000)
      }
      
      setQuotingFee(false)
      setHubUnwrapStep('sending')
      
      const feeTuple = {
        nativeFee: nativeFee,
        lzTokenFee: BigInt(0),
      }
      
      writeContract({
        address: CONTRACTS.OFTUSDC as `0x${string}`,
        abi: OFT_USDC_ABI_ARRAY,
        functionName: 'send',
        args: [sendParamTuple, feeTuple, evmAddress],
        value: nativeFee,
        gas: BigInt(10000000),
      })
    } catch (err) {
      console.error('Error unwrapping OFTUSDC:', err)
      setQuotingFee(false)
      setHubUnwrapStep('idle')
      alert(`Error unwrapping OFTUSDC: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ===== SPOKE CHAIN FUNCTIONS =====

  // Combined function: Approve spoke USDC then send cross-chain to hub
  const approveAndSendSpokeUSDC = async () => {
    if (!spokeUsdcAmount || !evmAddress || !publicClient) return
    
    const amount = parseUnits(spokeUsdcAmount, TOKEN_DECIMALS.USDC)
    
    const currentAllowance = spokeUsdcAllowance as bigint || BigInt(0)
    if (currentAllowance >= amount) {
      setSpokeApprovalStep('sending')
      await sendSpokeUSDCCrossChain()
      return
    }
    
    setSpokeApprovalStep('approving')
    writeContract({
      address: CONTRACTS.MockUSDCSpoke as `0x${string}`,
      abi: MOCK_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.USDCOFTAdapterSpoke as `0x${string}`, amount],
      gas: BigInt(100000),
    })
  }

  // Send USDC from spoke chain to hub chain via USDCOFTAdapterSpoke
  const sendSpokeUSDCCrossChain = async () => {
    if (!spokeUsdcAmount || !evmAddress || !publicClient) return
    
    try {
      setSpokeApprovalStep('sending')
      setSpokeQuotingFee(true)
      const amount = parseUnits(spokeUsdcAmount, TOKEN_DECIMALS.USDC)
      
      const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex()
        .toString()
      
      const sendParamTuple = {
        dstEid: LAYERZERO_CONFIG.hubEID, // Cross-chain to hub
        to: pad(evmAddress, { size: 32 }),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: options as `0x${string}`,
        composeMsg: '0x' as `0x${string}`,
        oftCmd: '0x' as `0x${string}`,
      }
      
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.USDCOFTAdapterSpoke as `0x${string}`,
          abi: USDC_OFT_ADAPTER_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParamTuple, false],
        })
        
        if (typeof quoteResult === 'object' && quoteResult !== null && 'nativeFee' in quoteResult) {
          nativeFee = (quoteResult as { nativeFee: bigint }).nativeFee
        } else if (Array.isArray(quoteResult)) {
          nativeFee = quoteResult[0] as bigint
        } else {
          nativeFee = quoteResult as bigint
        }
      } catch (quoteError) {
        nativeFee = BigInt(1000000000000000)
      }
      
      setSpokeQuotingFee(false)
      
      const feeTuple = {
        nativeFee: nativeFee,
        lzTokenFee: BigInt(0),
      }
      
      writeContract({
        address: CONTRACTS.USDCOFTAdapterSpoke as `0x${string}`,
        abi: USDC_OFT_ADAPTER_ABI_ARRAY,
        functionName: 'send',
        args: [sendParamTuple, feeTuple, evmAddress],
        value: nativeFee,
        gas: BigInt(10000000),
      })
    } catch (err) {
      console.error('Error bridging USDC cross-chain:', err)
      setSpokeQuotingFee(false)
      alert(`Error bridging USDC: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Unwrap OFTUSDC back to Spoke chain USDC (cross-chain unwrap)
  const unwrapOFTUSDCToSpokeChain = async () => {
    if (!spokeOftAmount || !evmAddress || !publicClient) return
    
    try {
      setSpokeUnwrapStep('quoting')
      setSpokeQuotingUnwrapFee(true)
      const amount = parseUnits(spokeOftAmount, TOKEN_DECIMALS.OFTUSDC)
      
      // Check if user has enough OFTUSDC balance
      const currentBalance = oftBalance as bigint || BigInt(0)
      if (amount > currentBalance) {
        alert(`Insufficient OFTUSDC balance. You have ${formatUnits(currentBalance, TOKEN_DECIMALS.OFTUSDC)} but trying to unwrap ${spokeOftAmount}`)
        setSpokeQuotingUnwrapFee(false)
        return
      }

      // Check spoke adapter liquidity (USDC locked) - Manual RPC call since we're on hub chain
      let spokeAdapterUsdcBalance: bigint
      try {
        // Encode balanceOf(address) call for spoke adapter
        const balanceOfSelector = '0x70a08231'
        const paddedAddress = CONTRACTS.USDCOFTAdapterSpoke.slice(2).padStart(64, '0')
        const data = balanceOfSelector + paddedAddress
        
        const response = await fetch(process.env.NEXT_PUBLIC_SPOKE_RPC_URL || 'http://localhost:8545', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
              to: CONTRACTS.MockUSDCSpoke,
              data: data
            }, 'latest'],
            id: 1
          })
        })
        
        const result = await response.json()
        spokeAdapterUsdcBalance = result.result ? BigInt(result.result) : BigInt(0)
      } catch (error) {
        console.error('Error fetching spoke adapter liquidity:', error)
        spokeAdapterUsdcBalance = BigInt(0)
      }

      const requiredUSDC = amount / BigInt(10 ** 12) // Convert from 18 to 6 decimals
      
      if (spokeAdapterUsdcBalance < requiredUSDC) {
        alert(
          `⚠️ Insufficient liquidity on spoke chain!\n\n` +
          `The spoke adapter has ${formatUnits(spokeAdapterUsdcBalance, TOKEN_DECIMALS.USDC)} USDC locked, ` +
          `but you need ${formatUnits(requiredUSDC, TOKEN_DECIMALS.USDC)} USDC to unwrap.\n\n` +
          `Lockbox Model: Each chain's adapter can only unlock USDC that was deposited on that chain.\n\n` +
          `Solutions:\n` +
          `• Wait for more users to deposit on spoke chain (increases liquidity)\n` +
          `• Unwrap to hub chain instead (use Hub tab)\n` +
          `• Contact platform to add liquidity`
        )
        setSpokeQuotingUnwrapFee(false)
        return
      }
      
      const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex()
        .toString()
      
      const sendParamTuple = {
        dstEid: LAYERZERO_CONFIG.spokeEID, // Cross-chain to spoke
        to: pad(evmAddress, { size: 32 }),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: options as `0x${string}`,
        composeMsg: '0x' as `0x${string}`,
        oftCmd: '0x' as `0x${string}`,
      }
      
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.OFTUSDC as `0x${string}`,
          abi: OFT_USDC_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParamTuple, false],
        })
        
        if (typeof quoteResult === 'object' && quoteResult !== null && 'nativeFee' in quoteResult) {
          nativeFee = (quoteResult as { nativeFee: bigint }).nativeFee
        } else if (Array.isArray(quoteResult)) {
          nativeFee = quoteResult[0] as bigint
        } else {
          nativeFee = quoteResult as bigint
        }
      } catch (quoteError) {
        nativeFee = BigInt(1000000000000000)
      }
      
      setSpokeQuotingUnwrapFee(false)
      setSpokeUnwrapStep('sending')
      
      const feeTuple = {
        nativeFee: nativeFee,
        lzTokenFee: BigInt(0),
      }
      
      // Verify peer configuration
      const peerBytes = await publicClient.readContract({
        address: CONTRACTS.OFTUSDC as `0x${string}`,
        abi: OFT_USDC_ABI_ARRAY,
        functionName: 'peers',
        args: [LAYERZERO_CONFIG.spokeEID],
      }) as `0x${string}`
      
      if (peerBytes === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        alert(
          `⚠️ Cross-chain not configured!\n\n` +
          `OFTUSDC contract doesn't have a peer configured for spoke chain (EID ${LAYERZERO_CONFIG.spokeEID}).\n\n` +
          `This is a deployment configuration issue. Please contact the platform administrator.`
        )
        setSpokeQuotingUnwrapFee(false)
        setSpokeUnwrapStep('idle')
        return
      }
      
      writeContract({
        address: CONTRACTS.OFTUSDC as `0x${string}`,
        abi: OFT_USDC_ABI_ARRAY,
        functionName: 'send',
        args: [sendParamTuple, feeTuple, evmAddress],
        value: nativeFee,
        gas: BigInt(10000000),
      })
    } catch (err) {
      console.error('Error unwrapping OFTUSDC to spoke chain:', err)
      setSpokeQuotingUnwrapFee(false)
      setSpokeUnwrapStep('idle')
      
      // Provide more specific error messages
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (errorMessage.includes('Internal JSON-RPC error') || errorMessage.includes('reverted')) {
        alert(
          `⚠️ Transaction Failed!\n\n` +
          `Possible reasons:\n` +
          `• Peer not configured: OFTUSDC → Spoke Adapter\n` +
          `• Wrong network: Make sure you're on hub chain\n` +
          `• LayerZero endpoint issue\n\n` +
          `Try unwrapping to hub chain instead (use Hub tab).`
        )
      } else {
        alert(`Error unwrapping to spoke chain: ${errorMessage}`)
      }
    }
  }

  // Copy address to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Check if contracts are properly configured (only check hub chain essentials)
  const contractsConfigured = !!(
    CONTRACTS.MockUSDCHub && 
    CONTRACTS.USDCOFTAdapterHub && 
    CONTRACTS.OFTUSDC
  )

  // Show loading state during hydration
  if (!isClient) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
              <h1 className="text-3xl font-bold text-foreground mb-4">Balance</h1>
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
            <Wallet className="h-10 w-10 text-primary" />
            Balance
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage your assets across Stacks and EVM chains
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="bg-card rounded-lg border p-2 mb-8 grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab('hub')}
            className={`py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === 'hub'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-transparent text-muted-foreground hover:bg-accent'
            }`}
          >
            <Zap className="h-5 w-5" />
            <span className="hidden sm:inline">Hub Chain</span>
            <span className="sm:hidden">Hub</span>
          </button>
          <button
            onClick={() => setActiveTab('spoke')}
            className={`py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === 'spoke'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-transparent text-muted-foreground hover:bg-accent'
            }`}
          >
            <Globe className="h-5 w-5" />
            <span className="hidden sm:inline">Spoke Chain</span>
            <span className="sm:hidden">Spoke</span>
          </button>
          <button
            onClick={() => setActiveTab('stacks')}
            className={`py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === 'stacks'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-transparent text-muted-foreground hover:bg-accent'
            }`}
          >
            <Bitcoin className="h-5 w-5" />
            <span className="hidden sm:inline">Stacks</span>
            <span className="sm:hidden">Stacks</span>
          </button>
        </div>

        {/* Hub Chain Content */}
        {activeTab === 'hub' && (
          <>
            {!isEvmConnected ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold text-foreground mb-4">Connect Your EVM Wallet</h2>
                  <p className="text-muted-foreground mb-8">Please connect your wallet to continue with hub chain operations</p>
                </div>
              </div>
            ) : (
              <>
                {/* User Balances */}
                <div className="bg-card rounded-lg border p-6 mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                      <DollarSign className="h-6 w-6 text-primary" />
                      Your EVM Balances
                    </h2>
                    <button
                      onClick={refreshAllBalances}
                      disabled={isRefreshing}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                      title="Refresh balances"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-accent p-4 rounded-lg">
                      <h3 className="font-semibold text-foreground">MockUSDC</h3>
                      <p className="text-2xl font-bold text-primary">
                        {usdcBalance ? formatUnits(usdcBalance as bigint, TOKEN_DECIMALS.USDC) : '0'} USDC
                      </p>
                    </div>
                    <div className="bg-accent p-4 rounded-lg">
                      <h3 className="font-semibold text-foreground">OFTUSDC</h3>
                      <p className="text-2xl font-bold text-primary">
                        {oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
                      </p>
                    </div>
                    <div className="bg-accent p-4 rounded-lg">
                      <h3 className="font-semibold text-foreground">Vault Shares</h3>
                      <p className="text-2xl font-bold text-primary">
                        {vaultBalance ? formatUnits(vaultBalance as bigint, TOKEN_DECIMALS.VAULT_SHARES) : '0'} Shares
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 1: USDC to OFTUSDC */}
                <div className="bg-card rounded-lg border p-6 mb-8">
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <ArrowRight className="h-6 w-6 text-primary" />
                    Step 1: Convert USDC to OFTUSDC (Hub Chain)
                  </h2>
                  
                  {/* Wrong Chain Warning */}
                  {!isOnSepoliaChain && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="text-sm text-red-800">
                          <p className="font-medium">⚠️ Wrong Network</p>
                          <p>You must switch to <strong>Sepolia (Chain ID: {SEPOLIA_CHAIN_ID})</strong> to perform hub chain operations.</p>
                          <p className="text-xs mt-1">Current chain: {chainId ? `Chain ID ${chainId}` : 'Unknown'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Amount (USDC - 6 decimals)
                      </label>
                      <input
                        type="number"
                        value={usdcAmount}
                        onChange={(e) => setUsdcAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                        placeholder="Enter USDC amount"
                        step="0.000001"
                        min="0"
                      />
                      {usdcAmount && (
                        <p className="text-sm text-muted-foreground mt-1">
                          You will receive approximately {usdcAmount} OFTUSDC (18 decimals)
                        </p>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={approveAndSendUSDC}
                        disabled={!isOnSepoliaChain || isPending || isApprovalConfirming || isConfirming || quotingFee || approvalStep !== 'idle' || !usdcAmount}
                        className="px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-all duration-200 font-semibold"
                      >
                        {approvalStep === 'approving' && isPending ? 'Approving USDC...' :
                         approvalStep === 'approving' && isApprovalConfirming ? 'Confirming Approval...' :
                         approvalStep === 'approved' && quotingFee ? 'Quoting Fee...' :
                         approvalStep === 'approved' ? 'Preparing to Send...' :
                         approvalStep === 'sending' && isPending ? 'Sending Transaction...' :
                         approvalStep === 'sending' && isConfirming ? 'Confirming Transaction...' :
                         approvalStep === 'sending' ? 'Sending...' :
                         quotingFee ? 'Quoting Fee...' :
                         isPending ? 'Processing...' :
                         isConfirming ? 'Confirming...' :
                         'Approve & Convert USDC to OFTUSDC'}
                      </button>
                    </div>
                    {/* Status indicator */}
                    {approvalStep !== 'idle' && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          {approvalStep === 'approving' && (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              <span className="text-sm text-blue-800">
                                {isPending ? 'Step 1: Approving USDC for adapter... Please confirm in your wallet.' :
                                 isApprovalConfirming ? 'Step 1: Waiting for approval confirmation on-chain...' :
                                 'Step 1: Approving USDC for adapter...'}
                              </span>
                            </>
                          )}
                          {approvalStep === 'approved' && (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm text-green-800">Step 1 Complete: USDC approved! Now converting via adapter...</span>
                            </>
                          )}
                          {approvalStep === 'sending' && (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              <span className="text-sm text-blue-800">
                                {isPending ? 'Step 2: Sending transaction... Please confirm in your wallet.' :
                                 isConfirming ? 'Step 2: Confirming transaction on-chain...' :
                                 'Step 2: Converting USDC to OFTUSDC via adapter...'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Start Investing notification - Show during sending and after successful transaction */}
                    {isConfirmed && (approvalStep === 'sending' || approvalStep === 'idle') && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-start gap-4">
                          <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="h-6 w-6" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-blue-900 mb-2">Start Investing in Properties</h3>
                            
                            {/* LayerZero Relay Notice */}
                            {showRelayNotice && (
                              <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 mb-4">
                                <div className="flex items-start gap-2">
                                  <Clock className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-sm text-orange-900 font-medium mb-1">⏳ Waiting for LayerZero Relay</p>
                                    <p className="text-xs text-orange-800 mb-2">
                                      Your transaction is confirmed! On testnets, LayerZero relay can take <strong>30 seconds to 2 minutes</strong>. 
                                      Your OFTUSDC balance will update automatically once complete.
                                    </p>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={refreshAllBalances}
                                        disabled={isRefreshing}
                                        className="px-2 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                                      >
                                        <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                                        Refresh Now
                                      </button>
                                      <button
                                        onClick={() => setShowRelayNotice(false)}
                                        className="px-2 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-xs hover:bg-orange-500/30 transition-colors"
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <p className="text-blue-800 mb-4">
                              Now that you have OFTUSDC, you can explore and invest in tokenized real estate properties. 
                              Browse available properties.
                            </p>
                            <div className="flex gap-3">
                              <a
                                href="/properties"
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold inline-flex items-center gap-2"
                              >
                                <Building2 className="h-5 w-5" />
                                Browse Properties
                              </a>
                              <a
                                href="/investments"
                                className="px-6 py-3 bg-blue-500/20 text-blue-400 border-2 border-blue-500 rounded-lg hover:bg-blue-500/30 transition-colors font-semibold inline-flex items-center gap-2"
                              >
                                <Wallet className="h-5 w-5" />
                                My Investments
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {usdcAllowance ? (
                      <p className="text-sm text-muted-foreground">
                        USDC Allowance: {formatUnits(usdcAllowance as bigint, TOKEN_DECIMALS.USDC)} USDC
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Step 2: Unwrap OFTUSDC back to USDC */}
                <div className="bg-card rounded-lg border p-6 mb-8">
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <ArrowRight className="h-6 w-6 text-primary" />
                    Step 2: Unwrap OFTUSDC to Hub Chain USDC
                  </h2>
                  
                  {/* Wrong Chain Warning */}
                  {!isOnSepoliaChain && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="text-sm text-red-800">
                          <p className="font-medium">⚠️ Wrong Network</p>
                          <p>You must switch to <strong>Sepolia (Chain ID: {SEPOLIA_CHAIN_ID})</strong> to unwrap OFTUSDC.</p>
                          <p className="text-xs mt-1">Current chain: {chainId ? `Chain ID ${chainId}` : 'Unknown'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p>Note: This only unwraps to hub chain USDC. If you came from spoke chain, use the spoke tab to unwrap back to spoke chain.</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        OFTUSDC Amount to Unwrap
                      </label>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-muted-foreground">
                          Available: {oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
                        </span>
                        {(() => {
                          const balance = oftBalance as bigint | undefined
                          return balance && balance > 0 ? (
                            <button
                              onClick={() => setOftAmount(formatUnits(balance, TOKEN_DECIMALS.OFTUSDC))}
                              className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded hover:bg-orange-200 transition-colors"
                            >
                              Max
                            </button>
                          ) : null
                        })()}
                      </div>
                      <input
                        type="number"
                        value={oftAmount}
                        onChange={(e) => setOftAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                        placeholder="Enter OFTUSDC amount to unwrap"
                        step="0.000000000000000001"
                        min="0"
                      />
                      {oftAmount && (
                        <p className="text-sm text-muted-foreground mt-1">
                          You will receive approximately {oftAmount} USDC (scaled to 6 decimals)
                        </p>
                      )}
                    </div>
                    <button
                      onClick={redeemOFTUSDCToUSDC}
                      disabled={!isOnSepoliaChain || hubUnwrapStep !== 'idle' || !oftAmount || parseFloat(oftAmount) <= 0}
                      className="w-full px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors font-semibold"
                    >
                      {hubUnwrapStep === 'quoting' ? 'Quoting Fee...' :
                       hubUnwrapStep === 'sending' ? 'Unwrapping & Confirming...' :
                       'Unwrap OFTUSDC to USDC'}
                    </button>
                    
                    {/* Status indicator */}
                    {hubUnwrapStep !== 'idle' && (
                      <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                          <span className="text-sm text-orange-800">
                            {hubUnwrapStep === 'quoting' && 'Calculating LayerZero fee...'}
                            {hubUnwrapStep === 'sending' && 'Unwrapping OFTUSDC to hub chain USDC... Please confirm and wait for confirmation.'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transaction Status */}
                {(isPending || isConfirming) && (
                  <div className="bg-accent border border-border rounded-lg p-4 mb-8">
                    <div className="flex items-center">
                      <Loader2 className="animate-spin h-4 w-4 text-primary mr-3" />
                      <span className="text-foreground">
                        {isPending ? 'Transaction pending...' : 'Waiting for confirmation...'}
                      </span>
                    </div>
                  </div>
                )}

                {isConfirmed && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-600 mr-3" />
                      <span className="text-green-800">Transaction confirmed!</span>
                    </div>
                  </div>
                )}

                {/* LayerZero Relay Notice */}
                {showRelayNotice && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 mb-2">⏳ Waiting for LayerZero Relay</h3>
                        <p className="text-sm text-blue-800 mb-2">
                          Your transaction is confirmed on-chain! However, on testnets, LayerZero relay can take <strong>30 seconds to 2 minutes</strong> to complete the cross-chain message delivery.
                        </p>
                        <p className="text-sm text-blue-800 mb-3">
                          Your OFTUSDC balance will update automatically once the relay is complete. You can refresh manually using the button above.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={refreshAllBalances}
                            disabled={isRefreshing}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm flex items-center gap-1"
                          >
                            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Check Now
                          </button>
                          <button
                            onClick={() => setShowRelayNotice(false)}
                            className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/30 transition-colors text-sm"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-red-600 mr-3" />
                      <span className="text-red-800">Error: {error.message}</span>
                    </div>
                  </div>
                )}

                {/* Flow Diagram */}
                <div className="bg-card rounded-lg border p-6">
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Zap className="h-6 w-6 text-primary" />
                    Hub Chain Local Flows
                  </h2>
                  <div className="space-y-6">
                    {/* Wrap Flow */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-green-700">📥 Wrap Flow (Hub USDC → OFTUSDC)</h3>
                      <div className="flex items-center justify-center space-x-4 text-sm flex-wrap gap-y-4">
                        <div className="bg-accent px-4 py-2 rounded-lg text-foreground font-semibold">Hub USDC (6 dec)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-blue-100 px-4 py-2 rounded-lg text-blue-800 font-medium">Adapter.send(HUB_EID)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-green-100 px-4 py-2 rounded-lg text-green-800 font-semibold">OFTUSDC (18 dec)</div>
                      </div>
                    </div>

                    {/* Unwrap Flow */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-orange-700">📤 Unwrap Flow (OFTUSDC → Hub USDC)</h3>
                      <div className="flex items-center justify-center space-x-4 text-sm flex-wrap gap-y-4">
                        <div className="bg-green-100 px-4 py-2 rounded-lg text-green-800 font-semibold">OFTUSDC (18 dec)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-blue-100 px-4 py-2 rounded-lg text-blue-800 font-medium">OFTUSDC.send(HUB_EID)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-accent px-4 py-2 rounded-lg text-foreground font-semibold">Hub USDC (6 dec)</div>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-800">
                        💡 <strong>Same-Chain Operations:</strong> Hub chain users can wrap and unwrap locally. Small LayerZero fee applies for same-chain operations.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Spoke Chain Content */}
        {activeTab === 'spoke' && (
          <>
            {!isEvmConnected ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold text-foreground mb-4">Connect Your EVM Wallet</h2>
                  <p className="text-muted-foreground mb-8">Please connect your wallet to continue with spoke chain operations</p>
                </div>
              </div>
            ) : (
              <>
                {/* User Balances */}
                <div className="bg-card rounded-lg border p-6 mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                      <DollarSign className="h-6 w-6 text-primary" />
                      Your Spoke Chain Balances
                    </h2>
                    <button
                      onClick={refreshAllBalances}
                      disabled={isRefreshing}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                      title="Refresh balances"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-accent p-4 rounded-lg">
                      <h3 className="font-semibold text-foreground">Spoke MockUSDC</h3>
                      <p className="text-2xl font-bold text-primary">
                        {spokeUsdcBalance ? formatUnits(spokeUsdcBalance as bigint, TOKEN_DECIMALS.USDC) : '0'} USDC
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">On Spoke Chain (Arbitrum/Optimism)</p>
                    </div>
                    <div className="bg-accent p-4 rounded-lg">
                      <h3 className="font-semibold text-foreground">Hub OFTUSDC</h3>
                      <p className="text-2xl font-bold text-green-600">
                        {oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">After bridging to hub</p>
                    </div>
                  </div>
                </div>

                {/* Bridge USDC to Hub */}
                <div className="bg-card rounded-lg border p-6 mb-8">
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Globe className="h-6 w-6 text-primary" />
                    Bridge USDC from Spoke to Hub
                  </h2>
                  
                  {/* Wrong Chain Warning */}
                  {!isOnBnbTestnetChain && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="text-sm text-red-800">
                          <p className="font-medium">⚠️ Wrong Network</p>
                          <p>You must switch to <strong>BNB Testnet (Chain ID: {BNB_TESTNET_CHAIN_ID})</strong> to bridge USDC from spoke chain.</p>
                          <p className="text-xs mt-1">Current chain: {chainId ? `Chain ID ${chainId}` : 'Unknown'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Network Instructions - Only show when on correct chain */}
                  {isOnBnbTestnetChain && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium">Bridge Instructions</p>
                          <p>After bridging, switch back to Sepolia (Chain ID: {SEPOLIA_CHAIN_ID}) to see your OFTUSDC on the hub chain.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Amount (USDC - 6 decimals)
                      </label>
                      <input
                        type="number"
                        value={spokeUsdcAmount}
                        onChange={(e) => setSpokeUsdcAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                        placeholder="Enter USDC amount to bridge"
                        step="0.000001"
                        min="0"
                      />
                      {spokeUsdcAmount && (
                        <p className="text-sm text-muted-foreground mt-1">
                          You will receive approximately {spokeUsdcAmount} OFTUSDC (18 decimals) on hub chain
                        </p>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={approveAndSendSpokeUSDC}
                        disabled={!isOnBnbTestnetChain || isPending || isManuallyConfirmingApproval || isManuallyConfirming || spokeQuotingFee || spokeApprovalStep !== 'idle' || !spokeUsdcAmount}
                        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-all duration-200 font-semibold"
                      >
                        {spokeApprovalStep === 'approving' && isPending ? 'Approving USDC...' :
                         spokeApprovalStep === 'approving' && isManuallyConfirmingApproval ? 'Confirming Approval...' :
                         spokeApprovalStep === 'approved' && spokeQuotingFee ? 'Quoting Fee...' :
                         spokeApprovalStep === 'approved' ? 'Preparing to Bridge...' :
                         spokeApprovalStep === 'sending' && isPending ? 'Sending Transaction...' :
                         spokeApprovalStep === 'sending' && isManuallyConfirming ? 'Confirming Transaction...' :
                         spokeApprovalStep === 'sending' ? 'Bridging...' :
                         spokeQuotingFee ? 'Quoting Fee...' :
                         isPending ? 'Processing...' :
                         'Approve & Bridge USDC to Hub'}
                      </button>
                    </div>
                    {/* Status indicator */}
                    {spokeApprovalStep !== 'idle' && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          {spokeApprovalStep === 'approving' && (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              <span className="text-sm text-blue-800">
                                {isPending ? 'Step 1: Approving USDC for adapter... Please confirm in your wallet.' :
                                 isManuallyConfirmingApproval ? 'Step 1: Waiting for approval confirmation on BSC...' :
                                 'Step 1: Approving USDC for adapter...'}
                              </span>
                            </>
                          )}
                          {spokeApprovalStep === 'approved' && (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm text-green-800">Step 1 Complete: USDC approved! Now bridging cross-chain...</span>
                            </>
                          )}
                          {spokeApprovalStep === 'sending' && (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              <span className="text-sm text-blue-800">
                                {isPending ? 'Step 2: Sending transaction... Please confirm in your wallet.' :
                                 isManuallyConfirming ? 'Step 2: Confirming transaction on BSC...' :
                                 'Step 2: Bridging USDC to hub chain...'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {spokeUsdcAllowance ? (
                      <p className="text-sm text-muted-foreground">
                        Spoke USDC Allowance: {formatUnits(spokeUsdcAllowance as bigint, TOKEN_DECIMALS.USDC)} USDC
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Unwrap OFTUSDC to Spoke Chain USDC */}
                <div className="bg-card rounded-lg border p-6 mb-8">
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <ArrowRight className="h-6 w-6 text-primary" />
                    Unwrap OFTUSDC to Spoke Chain USDC
                  </h2>
                  
                  {/* Wrong Chain Warning */}
                  {!isOnSepoliaChain && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="text-sm text-red-800">
                          <p className="font-medium">⚠️ Wrong Network</p>
                          <p>You must switch to <strong>Sepolia (Chain ID: {SEPOLIA_CHAIN_ID})</strong> to unwrap OFTUSDC to spoke chain.</p>
                          <p className="text-xs mt-1">Current chain: {chainId ? `Chain ID ${chainId}` : 'Unknown'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Network Instructions - Only show when on correct chain */}
                  {isOnSepoliaChain && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium">Cross-Chain Unwrap</p>
                          <p>After unwrapping, your USDC will appear on BNB Testnet. Check your spoke balance above.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        OFTUSDC Amount to Unwrap
                      </label>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-muted-foreground">
                          Available: {oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
                        </span>
                        {(() => {
                          const balance = oftBalance as bigint | undefined
                          return balance && balance > 0 ? (
                            <button
                              onClick={() => setSpokeOftAmount(formatUnits(balance, TOKEN_DECIMALS.OFTUSDC))}
                              className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 transition-colors"
                            >
                              Max
                            </button>
                          ) : null
                        })()}
                      </div>
                      <input
                        type="number"
                        value={spokeOftAmount}
                        onChange={(e) => setSpokeOftAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                        placeholder="Enter OFTUSDC amount to unwrap"
                        step="0.000000000000000001"
                        min="0"
                      />
                      {spokeOftAmount && (
                        <p className="text-sm text-muted-foreground mt-1">
                          You will receive approximately {spokeOftAmount} USDC (scaled to 6 decimals) on spoke chain
                        </p>
                      )}
                    </div>
                    <button
                      onClick={unwrapOFTUSDCToSpokeChain}
                      disabled={!isOnSepoliaChain || spokeUnwrapStep !== 'idle' || !spokeOftAmount || parseFloat(spokeOftAmount) <= 0}
                      className="w-full px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors font-semibold"
                    >
                      {spokeUnwrapStep === 'quoting' ? 'Quoting Fee...' :
                       spokeUnwrapStep === 'sending' ? 'Unwrapping & Confirming...' :
                       'Unwrap to Spoke Chain USDC'}
                    </button>
                    
                    {/* Status indicator */}
                    {spokeUnwrapStep !== 'idle' && (
                      <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                          <span className="text-sm text-purple-800">
                            {spokeUnwrapStep === 'quoting' && 'Calculating LayerZero cross-chain fee...'}
                            {spokeUnwrapStep === 'sending' && 'Unwrapping OFTUSDC to spoke chain... Please confirm and wait for confirmation.'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transaction Status */}
                {(isPending || isConfirming) && (
                  <div className="bg-accent border border-border rounded-lg p-4 mb-8">
                    <div className="flex items-center">
                      <Loader2 className="animate-spin h-4 w-4 text-primary mr-3" />
                      <span className="text-foreground">
                        {isPending ? 'Transaction pending...' : 'Waiting for confirmation...'}
                      </span>
                    </div>
                  </div>
                )}

                {isConfirmed && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-600 mr-3" />
                      <span className="text-green-800">Transaction confirmed!</span>
                    </div>
                  </div>
                )}

                {/* LayerZero Relay Notice for Spoke Chain */}
                {showRelayNotice && spokeApprovalStep === 'idle' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 mb-2">⏳ Waiting for LayerZero Cross-Chain Relay</h3>
                        <p className="text-sm text-blue-800 mb-2">
                          Your transaction is confirmed on the spoke chain! However, on testnets, LayerZero cross-chain relay can take <strong>30 seconds to 2 minutes</strong> to deliver your OFTUSDC to the hub chain.
                        </p>
                        <p className="text-sm text-blue-800 mb-3">
                          Your hub chain OFTUSDC balance will update automatically once the relay is complete. You can refresh manually using the button above.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={refreshAllBalances}
                            disabled={isRefreshing}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm flex items-center gap-1"
                          >
                            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Check Now
                          </button>
                          <button
                            onClick={() => setShowRelayNotice(false)}
                            className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/30 transition-colors text-sm"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-red-600 mr-3" />
                      <span className="text-red-800">Error: {error.message}</span>
                    </div>
                  </div>
                )}

                {/* Flow Diagram */}
                <div className="bg-card rounded-lg border p-6">
                  <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                    <Globe className="h-6 w-6 text-primary" />
                    Cross-Chain Flows (Spoke ↔ Hub)
                  </h2>
                  <div className="space-y-6">
                    {/* Deposit Flow */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-green-700">📥 Deposit Flow (Spoke → Hub)</h3>
                      <div className="flex items-center justify-center space-x-4 text-sm flex-wrap gap-y-4">
                        <div className="bg-purple-100 px-4 py-2 rounded-lg text-purple-800 font-semibold">Spoke USDC (6 dec)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-blue-100 px-4 py-2 rounded-lg text-blue-800 font-medium">Adapter.send(HUB_EID)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-orange-100 px-4 py-2 rounded-lg text-orange-800 font-medium">LayerZero</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-green-100 px-4 py-2 rounded-lg text-green-800 font-semibold">Hub OFTUSDC (18 dec)</div>
                      </div>
                    </div>
                    
                    {/* Withdrawal Flow */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-purple-700">📤 Withdrawal Flow (Hub → Spoke)</h3>
                      <div className="flex items-center justify-center space-x-4 text-sm flex-wrap gap-y-4">
                        <div className="bg-green-100 px-4 py-2 rounded-lg text-green-800 font-semibold">Hub OFTUSDC (18 dec)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-blue-100 px-4 py-2 rounded-lg text-blue-800 font-medium">OFTUSDC.send(SPOKE_EID)</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-orange-100 px-4 py-2 rounded-lg text-orange-800 font-medium">LayerZero</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="bg-purple-100 px-4 py-2 rounded-lg text-purple-800 font-semibold">Spoke USDC (6 dec)</div>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-800">
                        💡 <strong>Lockbox Model:</strong> Each chain's adapter locks USDC. When you unwrap, it unlocks USDC on that specific chain. Users redeem back to their origin chain.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Stacks Content */}
        {activeTab === 'stacks' && (
          <>
            {/* Connection Status */}
            <div className="bg-card rounded-lg border p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Globe className="h-6 w-6 text-primary" />
                  Connection Status
                </h2>
                {stacksConnected && (
                  <button
                    onClick={refreshBalances}
                    disabled={isRefreshing}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                    title="Refresh Stacks balances"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                )}
              </div>
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
                          <span className="font-semibold">{stacksAccount.balance} STX</span>
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
                      <>
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
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">MockUSDC:</span>
                          <span className="font-semibold">{usdcBalance ? formatUnits(usdcBalance as bigint, TOKEN_DECIMALS.USDC) : '0'} USDC</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">OFTUSDC:</span>
                          <span className="font-semibold">{oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Vault Shares:</span>
                          <span className="font-semibold">{vaultBalance ? formatUnits(vaultBalance as bigint, TOKEN_DECIMALS.VAULT_SHARES) : '0'} Shares</span>
                        </div>
                      </>
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
                            className="px-4 py-3 rounded-lg font-semibold transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
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
                          <p>You need to register your Stacks address with an EVM custodian address before depositing sBTC. This enables cross-chain OFTUSDC minting.</p>
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
                  Deposit sBTC
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-accent rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Your sBTC Balance</h3>
                    <p className="text-2xl font-bold text-orange-600">{stacksAccount?.sbtcBalance || '0'} sBTC</p>
                  </div>
                  <div className="bg-accent rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Minimum Deposit</h3>
                    <p className="text-2xl font-bold text-foreground">{mockMinDeposit} sBTC</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Amount (sBTC)
                    </label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                      placeholder="Enter sBTC amount"
                      step="0.000001"
                      min="0"
                    />
                    {depositAmount && (
                      <p className="text-sm text-muted-foreground mt-1">
                        You will receive approximately {(parseFloat(depositAmount) * SBTC_PRICE_USD).toLocaleString()} OFTUSDC (at ${SBTC_PRICE_USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/sBTC)
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
                        : 'bg-orange-600 text-white hover:bg-orange-700'
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
                        <span>Deposit sBTC</span>
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
              <div className="bg-card rounded-lg border p-6 mb-8">
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
                              href={`${STACKS_CONFIG.explorerUrl}/tx/${deposit.txHash}`}
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
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                How It Works
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bitcoin className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="font-semibold mb-2">1. Deposit sBTC</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect your Stacks wallet and deposit sBTC to the BrickVault gateway contract
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
          </>
        )}
      </main>
    </div>
  )
}

