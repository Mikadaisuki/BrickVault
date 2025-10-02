'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, pad } from 'viem'
import { MOCK_USDC_ABI, OFT_USDC_ABI, SHARE_OFT_ADAPTER_ABI, PROPERTY_VAULT_GOVERNANCE_ABI } from '@brickvault/abi'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS, LAYERZERO_CONFIG } from '../../config/contracts'
import { Header } from '@/components/Header'
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
  Zap
} from 'lucide-react'

// Extract ABIs - some are artifacts with .abi property, some are plain arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractAbi = (abiOrArtifact: any) => abiOrArtifact?.abi || abiOrArtifact
const MOCK_USDC_ABI_ARRAY = extractAbi(MOCK_USDC_ABI)
const SHARE_OFT_ADAPTER_ABI_ARRAY = extractAbi(SHARE_OFT_ADAPTER_ABI)
const OFT_USDC_ABI_ARRAY = extractAbi(OFT_USDC_ABI)
const PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY = extractAbi(PROPERTY_VAULT_GOVERNANCE_ABI)

// Contract addresses from generated config
const CONTRACTS = {
  MockUSDC: CONTRACT_ADDRESSES.MockUSDC,
  ShareOFTAdapter: CONTRACT_ADDRESSES.ShareOFTAdapter,
  OFTUSDC: CONTRACT_ADDRESSES.OFTUSDC,
  PropertyVault: CONTRACT_ADDRESSES.PropertyVault,
}

// ABIs are now imported from @brickvault/abi package

export default function CrossChainDemo() {
  const { address, isConnected } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })
  
  // Track approval transaction separately
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>()
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } = useWaitForTransactionReceipt({
    hash: approvalHash,
  })
  const publicClient = usePublicClient()
  
  // Handle hydration by tracking if we're on the client
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])

  const [usdcAmount, setUsdcAmount] = useState('')
  const [oftAmount, setOftAmount] = useState('')
  const [vaultAmount, setVaultAmount] = useState('')
  const [quotingFee, setQuotingFee] = useState(false)
  const [approvalStep, setApprovalStep] = useState<'idle' | 'approving' | 'approved' | 'sending'>('idle')
  const [vaultStep, setVaultStep] = useState<'idle' | 'approving' | 'approved' | 'depositing'>('idle')

  // Log errors from writeContract
  useEffect(() => {
    if (error) {
      console.error('writeContract error:', error)
    }
  }, [error])

  // Track approval transaction hash when it's created
  useEffect(() => {
    if (hash && approvalStep === 'approving') {
      setApprovalHash(hash)
    }
    if (hash && vaultStep === 'approving') {
      setApprovalHash(hash)
    }
  }, [hash, approvalStep, vaultStep])

  // Auto-trigger cross-chain send after approval is confirmed
  useEffect(() => {
    if (isApprovalConfirmed && approvalStep === 'approving') {
      setApprovalStep('approved')
      // Proceed to cross-chain send after approval is confirmed
      setTimeout(() => {
        sendUSDCCrossChain()
      }, 100) // Minimal delay to ensure state updates are processed
    }
  }, [isApprovalConfirmed, approvalStep])

  // Auto-trigger vault deposit after OFT approval is confirmed
  useEffect(() => {
    if (isApprovalConfirmed && vaultStep === 'approving') {
      setVaultStep('approved')
      // Proceed to vault deposit after approval is confirmed
      setTimeout(() => {
        depositToVault()
      }, 100) // Minimal delay to ensure state updates are processed
    }
  }, [isApprovalConfirmed, vaultStep])

  // Reset approval step when transaction is completed or there's an error
  useEffect(() => {
    if (isConfirmed && approvalStep === 'sending') {
      setApprovalStep('idle')
      setApprovalHash(undefined)
    }
    if (isConfirmed && vaultStep === 'depositing') {
      setVaultStep('idle')
      setApprovalHash(undefined)
    }
    if (error) {
      setApprovalStep('idle')
      setVaultStep('idle')
      setApprovalHash(undefined)
    }
  }, [isConfirmed, error, approvalStep, vaultStep])

  // Read user balances
  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.MockUSDC as `0x${string}`,
    abi: MOCK_USDC_ABI_ARRAY,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const { data: oftBalance } = useReadContract({
    address: CONTRACTS.OFTUSDC as `0x${string}`,
    abi: OFT_USDC_ABI_ARRAY,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const { data: vaultBalance } = useReadContract({
    address: CONTRACTS.PropertyVault as `0x${string}`,
    abi: PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const { data: totalVaultAssets } = useReadContract({
    address: CONTRACTS.PropertyVault as `0x${string}`,
    abi: PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY,
    functionName: 'totalAssets',
  })

  // Read allowances
  const { data: usdcAllowance } = useReadContract({
    address: CONTRACTS.MockUSDC as `0x${string}`,
    abi: MOCK_USDC_ABI_ARRAY,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.ShareOFTAdapter as `0x${string}`] : undefined,
  })

  const { data: oftAllowance } = useReadContract({
    address: CONTRACTS.OFTUSDC as `0x${string}`,
    abi: OFT_USDC_ABI_ARRAY,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.PropertyVault as `0x${string}`] : undefined,
  })

  // Step 1: Approve USDC for OFT Adapter
  const approveUSDC = async () => {
    if (!usdcAmount) return
    
    const amount = parseUnits(usdcAmount, TOKEN_DECIMALS.USDC)
    
    setApprovalStep('approving')
    writeContract({
      address: CONTRACTS.MockUSDC as `0x${string}`,
      abi: MOCK_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.ShareOFTAdapter as `0x${string}`, amount],
      gas: BigInt(100000), // Standard gas limit for approve
    })
  }

  // Combined function: Approve USDC then send cross-chain
  const approveAndSendUSDC = async () => {
    if (!usdcAmount || !address || !publicClient) return
    
    const amount = parseUnits(usdcAmount, TOKEN_DECIMALS.USDC)
    
    // Check if we already have sufficient allowance
    const currentAllowance = usdcAllowance as bigint || BigInt(0)
    if (currentAllowance >= amount) {
      // We already have enough allowance, proceed directly to send
      setApprovalStep('sending')
      await sendUSDCCrossChain()
      return
    }
    
    // Step 1: Approve USDC
    setApprovalStep('approving')
    writeContract({
      address: CONTRACTS.MockUSDC as `0x${string}`,
      abi: MOCK_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.ShareOFTAdapter as `0x${string}`, amount],
      gas: BigInt(100000),
    })
  }

  // Step 2: Send USDC cross-chain via OFTAdapter to get OFTUSDC
  const sendUSDCCrossChain = async () => {
    if (!usdcAmount || !address || !publicClient) return
    
    try {
      setApprovalStep('sending')
      setQuotingFee(true)
      const amount = parseUnits(usdcAmount, TOKEN_DECIMALS.USDC)
      
      // Create LayerZero options (same as in test)
      const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex()
        .toString()
      
      // Prepare cross-chain send parameters as a tuple (used for both quote and send)
      const sendParamTuple = {
        dstEid: LAYERZERO_CONFIG.eidB,
        to: pad(address, { size: 32 }),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: options as `0x${string}`,
        composeMsg: '0x' as `0x${string}`,
        oftCmd: '0x' as `0x${string}`,
      }
      
      // Quote the native fee (same as in test)
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.ShareOFTAdapter as `0x${string}`,
          abi: SHARE_OFT_ADAPTER_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParamTuple, false],
        })
        
        console.log('Quote result:', quoteResult)
        
        // Handle different return types - quoteSend returns MessagingFee tuple
        if (typeof quoteResult === 'object' && quoteResult !== null && 'nativeFee' in quoteResult) {
          nativeFee = (quoteResult as { nativeFee: bigint }).nativeFee
        } else if (Array.isArray(quoteResult)) {
          nativeFee = quoteResult[0] as bigint
        } else {
          nativeFee = quoteResult as bigint
        }
        
        console.log('Quoted native fee:', nativeFee.toString())
      } catch (quoteError) {
        console.warn('quoteSend failed, using fallback fee:', quoteError)
        // Fallback to a reasonable fee for mock endpoint (0.001 ETH)
        nativeFee = BigInt(1000000000000000)
      }
      
      setQuotingFee(false)
      
      console.log('Preparing to send transaction...')
      console.log('Contract:', CONTRACTS.ShareOFTAdapter)
      console.log('nativeFee:', nativeFee.toString())
      console.log('address:', address)
      
      // Structure fee as a proper tuple
      const feeTuple = {
        nativeFee: nativeFee,
        lzTokenFee: BigInt(0),
      }
      
      console.log('sendParamTuple:', sendParamTuple)
      console.log('feeTuple:', feeTuple)
      
      writeContract({
        address: CONTRACTS.ShareOFTAdapter as `0x${string}`,
        abi: SHARE_OFT_ADAPTER_ABI_ARRAY,
        functionName: 'send',
        args: [sendParamTuple, feeTuple, address],
        value: nativeFee,
        gas: BigInt(10000000), // Set high gas limit for cross-chain transaction
      })
      
      console.log('writeContract called successfully')
    } catch (err) {
      console.error('Error sending cross-chain:', err)
      setQuotingFee(false)
    }
  }


  // Step 3: Approve OFTUSDC for Property Vault
  const approveOFT = async () => {
    if (!oftAmount) return
    
    const amount = parseUnits(oftAmount, TOKEN_DECIMALS.OFTUSDC)
    
    setVaultStep('approving')
    writeContract({
      address: CONTRACTS.OFTUSDC as `0x${string}`,
      abi: OFT_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.PropertyVault as `0x${string}`, amount],
      gas: BigInt(100000), // Standard gas limit for approve
    })
  }

  // Combined function: Approve OFTUSDC then deposit to vault
  const approveAndDepositOFT = async () => {
    if (!oftAmount) return
    
    const amount = parseUnits(oftAmount, TOKEN_DECIMALS.OFTUSDC)
    
    // Check if we already have sufficient allowance
    const currentAllowance = oftAllowance as bigint || BigInt(0)
    if (currentAllowance >= amount) {
      // We already have enough allowance, proceed directly to deposit
      setVaultStep('depositing')
      await depositToVault()
      return
    }
    
    // Step 1: Approve OFTUSDC
    setVaultStep('approving')
    writeContract({
      address: CONTRACTS.OFTUSDC as `0x${string}`,
      abi: OFT_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.PropertyVault as `0x${string}`, amount],
      gas: BigInt(100000),
    })
  }

  // Step 4: Deposit OFTUSDC to Property Vault
  const depositToVault = async () => {
    if (!oftAmount) return
    
    const amount = parseUnits(oftAmount, TOKEN_DECIMALS.OFTUSDC)
    
    setVaultStep('depositing')
    writeContract({
      address: CONTRACTS.PropertyVault as `0x${string}`,
      abi: PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY,
      functionName: 'deposit',
      args: [amount, address!],
      gas: BigInt(500000), // Gas limit for vault deposit
    })
  }

  // Step 5: Withdraw from Vault
  const withdrawFromVault = async () => {
    if (!vaultAmount || !vaultBalance) return
    
    const amount = parseUnits(vaultAmount, TOKEN_DECIMALS.VAULT_SHARES)
    
    writeContract({
      address: CONTRACTS.PropertyVault as `0x${string}`,
      abi: PROPERTY_VAULT_GOVERNANCE_ABI_ARRAY,
      functionName: 'redeem',
      args: [amount, address!, address!],
      gas: BigInt(500000), // Gas limit for vault redeem
    })
  }

  // Step 6: Redeem OFTUSDC back to USDC cross-chain
  const redeemOFTUSDCToUSDC = async () => {
    if (!oftAmount || !address || !publicClient) return
    
    try {
      setQuotingFee(true)
      const amount = parseUnits(oftAmount, TOKEN_DECIMALS.OFTUSDC)
      
      // Create LayerZero options
      const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex()
        .toString()
      
      // Prepare cross-chain send parameters as a tuple (redeem back to USDC)
      const sendParamTuple = {
        dstEid: LAYERZERO_CONFIG.eidA, // destination endpoint ID (back to source chain)
        to: pad(address, { size: 32 }), // destination address
        amountLD: amount, // amount to redeem (18 decimals)
        minAmountLD: amount, // minimum amount to receive (same decimals for OFTUSDC)
        extraOptions: options as `0x${string}`, // LayerZero options
        composeMsg: '0x' as `0x${string}`, // compose message
        oftCmd: '0x' as `0x${string}`, // oft command
      }
      
      // Quote the native fee
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.OFTUSDC as `0x${string}`,
          abi: OFT_USDC_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParamTuple, false],
        })
        
        console.log('Quote result for redeem:', quoteResult)
        
        // Handle different return types - quoteSend returns MessagingFee tuple
        if (typeof quoteResult === 'object' && quoteResult !== null && 'nativeFee' in quoteResult) {
          nativeFee = (quoteResult as { nativeFee: bigint }).nativeFee
        } else if (Array.isArray(quoteResult)) {
          nativeFee = quoteResult[0] as bigint
        } else {
          nativeFee = quoteResult as bigint
        }
        
        console.log('Quoted native fee for redeem:', nativeFee.toString())
      } catch (quoteError) {
        console.warn('quoteSend failed for redeem, using fallback fee:', quoteError)
        // Fallback to a reasonable fee for mock endpoint (0.001 ETH)
        nativeFee = BigInt(1000000000000000)
      }
      
      setQuotingFee(false)
      
      // Structure fee as a proper tuple
      const feeTuple = {
        nativeFee: nativeFee,
        lzTokenFee: BigInt(0),
      }
      
      console.log('sendParamTuple for redeem:', sendParamTuple)
      console.log('feeTuple for redeem:', feeTuple)
      
      writeContract({
        address: CONTRACTS.OFTUSDC as `0x${string}`,
        abi: OFT_USDC_ABI_ARRAY,
        functionName: 'send',
        args: [sendParamTuple, feeTuple, address], // [sendParamTuple, feeTuple, refundTo]
        value: nativeFee,
        gas: BigInt(10000000), // Set high gas limit for cross-chain transaction
      })
    } catch (err) {
      console.error('Error redeeming cross-chain:', err)
      setQuotingFee(false)
    }
  }

  // Check if contracts are properly configured
  const contractsConfigured = Object.values(CONTRACTS).every(addr => addr && addr.length > 0)

  // Show loading state during hydration
  if (!isClient) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
              <h1 className="text-3xl font-bold text-foreground mb-4">Cross-Chain USDC Demo</h1>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h1 className="text-3xl font-bold text-foreground mb-4">Cross-Chain USDC Demo</h1>
              <p className="text-muted-foreground mb-8">Please connect your wallet to continue</p>
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
            <Zap className="h-10 w-10 text-yellow-500" />
            Cross-Chain USDC Demo
          </h1>
          <p className="text-muted-foreground text-lg">
            Experience the complete LayerZero cross-chain flow: USDC → OFTUSDC → Cross-Chain Transfer → Property Vault → ShareOFT
          </p>
        </div>

        {/* User Balances */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Your Balances
          </h2>
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

        {/* Vault Info */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Property Vault Info
          </h2>
          <div className="bg-accent p-4 rounded-lg">
            <p className="text-foreground">
              <strong>Total Assets:</strong> {totalVaultAssets ? formatUnits(totalVaultAssets as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
            </p>
            <p className="text-foreground">
              <strong>Vault Address:</strong> {CONTRACTS.PropertyVault}
            </p>
          </div>
        </div>

        {/* Step 1: USDC to OFTUSDC */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <ArrowRight className="h-6 w-6 text-primary" />
            Step 1: Approve & Send USDC Cross-Chain to Get OFTUSDC
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Amount (USDC)
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
                  You will receive approximately {usdcAmount} OFTUSDC (scaled to 18 decimals)
                </p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={approveAndSendUSDC}
                disabled={isPending || isApprovalConfirming || quotingFee || !usdcAmount}
                className="px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-all duration-200 font-semibold"
              >
                {approvalStep === 'approving' && isPending ? 'Approving USDC...' :
                 approvalStep === 'approved' && (quotingFee || isPending) ? 'Sending Cross-Chain...' :
                 quotingFee ? 'Quoting Fee...' :
                 isPending ? 'Processing...' :
                 'Approve & Send USDC Cross-Chain'}
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
                        {isPending ? 'Step 1: Approving USDC... Please confirm the transaction in your wallet.' :
                         isApprovalConfirming ? 'Step 1: Waiting for approval confirmation on-chain...' :
                         'Step 1: Approving USDC...'}
                      </span>
                    </>
                  )}
                  {approvalStep === 'approved' && (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-800">Step 1 Complete: USDC approved! Now sending cross-chain...</span>
                    </>
                  )}
                  {approvalStep === 'sending' && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-sm text-blue-800">Step 2: Sending USDC cross-chain... Please confirm the transaction in your wallet.</span>
                    </>
                  )}
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


        {/* Step 2: OFTUSDC to Vault */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Step 2: Approve & Deposit OFTUSDC to Property Vault
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Amount (OFTUSDC)
              </label>
              <input
                type="number"
                value={oftAmount}
                onChange={(e) => setOftAmount(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                placeholder="Enter OFTUSDC amount"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={approveAndDepositOFT}
                disabled={isPending || isApprovalConfirming || !oftAmount}
                className="px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-all duration-200 font-semibold"
              >
                {vaultStep === 'approving' && isPending ? 'Approving OFTUSDC...' :
                 vaultStep === 'approved' && isPending ? 'Depositing to Vault...' :
                 isPending ? 'Processing...' :
                 'Approve & Deposit OFTUSDC to Vault'}
              </button>
            </div>
            
            {/* Status indicator */}
            {vaultStep !== 'idle' && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  {vaultStep === 'approving' && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-sm text-blue-800">
                        {isPending ? 'Step 1: Approving OFTUSDC... Please confirm the transaction in your wallet.' :
                         isApprovalConfirming ? 'Step 1: Waiting for approval confirmation on-chain...' :
                         'Step 1: Approving OFTUSDC...'}
                      </span>
                    </>
                  )}
                  {vaultStep === 'approved' && (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-800">Step 1 Complete: OFTUSDC approved! Now depositing to vault...</span>
                    </>
                  )}
                  {vaultStep === 'depositing' && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-sm text-blue-800">Step 2: Depositing to vault... Please confirm the transaction in your wallet.</span>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {oftAllowance ? (
              <p className="text-sm text-muted-foreground">
                OFTUSDC Allowance: {formatUnits(oftAllowance as bigint, TOKEN_DECIMALS.OFTUSDC)} OFTUSDC
              </p>
            ) : null}
          </div>
        </div>

        {/* Step 3: Withdraw from Vault */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Step 3: Withdraw from Property Vault
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Amount (Vault Shares)
              </label>
              <input
                type="number"
                value={vaultAmount}
                onChange={(e) => setVaultAmount(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                placeholder="Enter vault shares amount"
              />
            </div>
            <button
              onClick={withdrawFromVault}
              disabled={isPending || !vaultAmount}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Withdrawing...' : 'Withdraw from Vault'}
            </button>
          </div>
        </div>

        {/* Step 4: Redeem OFTUSDC back to USDC */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <ArrowLeft className="h-6 w-6 text-primary" />
            Step 4: Redeem OFTUSDC back to USDC
          </h2>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-orange-800">
              <strong>Redeem Info:</strong> OFTUSDC (18 decimals) → USDC (6 decimals) via LayerZero cross-chain transfer. 
              Your OFTUSDC will be automatically scaled back to 6 decimals when converted to USDC.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                OFTUSDC Amount to Redeem
              </label>
              <input
                type="number"
                value={oftAmount}
                onChange={(e) => setOftAmount(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                placeholder="Enter OFTUSDC amount to redeem"
                step="0.000000000000000001"
                min="0"
              />
              {oftAmount && (
                <p className="text-sm text-muted-foreground mt-1">
                  You will receive approximately {oftAmount} USDC (scaled back to 6 decimals)
                </p>
              )}
            </div>
            <button
              onClick={redeemOFTUSDCToUSDC}
              disabled={isPending || quotingFee || !oftAmount}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {quotingFee ? 'Quoting Fee...' : isPending ? 'Redeeming...' : 'Redeem OFTUSDC to USDC'}
            </button>
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
            Cross-Chain Flow
          </h2>
          <div className="flex items-center justify-center space-x-4 text-sm">
            <div className="bg-accent px-4 py-2 rounded-lg text-foreground">USDC</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="bg-accent px-4 py-2 rounded-lg text-foreground">OFTUSDC</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="bg-accent px-4 py-2 rounded-lg text-foreground">Vault Shares</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="bg-accent px-4 py-2 rounded-lg text-foreground">Withdraw</div>
          </div>
        </div>
      </main>
    </div>
  )
}

