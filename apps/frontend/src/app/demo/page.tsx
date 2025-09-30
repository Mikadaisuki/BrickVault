'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, pad } from 'viem'
import { MOCK_USDC_ABI, OFT_USDC_ABI, SHARE_OFT_ADAPTER_ABI, PROPERTY_VAULT_ABI } from '@brickvault/abi'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { CONTRACT_ADDRESSES, TOKEN_DECIMALS, LAYERZERO_CONFIG } from '../../config/contracts'

// Extract ABIs - some are artifacts with .abi property, some are plain arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractAbi = (abiOrArtifact: any) => abiOrArtifact?.abi || abiOrArtifact
const MOCK_USDC_ABI_ARRAY = extractAbi(MOCK_USDC_ABI)
const SHARE_OFT_ADAPTER_ABI_ARRAY = extractAbi(SHARE_OFT_ADAPTER_ABI)
const OFT_USDC_ABI_ARRAY = extractAbi(OFT_USDC_ABI)
const PROPERTY_VAULT_ABI_ARRAY = extractAbi(PROPERTY_VAULT_ABI)

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

  // Log errors from writeContract
  useEffect(() => {
    if (error) {
      console.error('writeContract error:', error)
    }
  }, [error])

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
    abi: PROPERTY_VAULT_ABI_ARRAY,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const { data: totalVaultAssets } = useReadContract({
    address: CONTRACTS.PropertyVault as `0x${string}`,
    abi: PROPERTY_VAULT_ABI_ARRAY,
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
    
    writeContract({
      address: CONTRACTS.MockUSDC as `0x${string}`,
      abi: MOCK_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.ShareOFTAdapter as `0x${string}`, amount],
      gas: BigInt(100000), // Standard gas limit for approve
    })
  }

  // Step 2: Send USDC cross-chain via OFTAdapter to get OFTUSDC
  const sendUSDCCrossChain = async () => {
    if (!usdcAmount || !address || !publicClient) return
    
    try {
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
    
    writeContract({
      address: CONTRACTS.OFTUSDC as `0x${string}`,
      abi: OFT_USDC_ABI_ARRAY,
      functionName: 'approve',
      args: [CONTRACTS.PropertyVault as `0x${string}`, amount],
      gas: BigInt(100000), // Standard gas limit for approve
    })
  }

  // Step 4: Deposit OFTUSDC to Property Vault
  const depositToVault = async () => {
    if (!oftAmount) return
    
    const amount = parseUnits(oftAmount, TOKEN_DECIMALS.OFTUSDC)
    
    writeContract({
      address: CONTRACTS.PropertyVault as `0x${string}`,
      abi: PROPERTY_VAULT_ABI_ARRAY,
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
      abi: PROPERTY_VAULT_ABI_ARRAY,
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
      
      // Prepare cross-chain send parameters (redeem back to USDC)
      const sendParam = [
        LAYERZERO_CONFIG.eidA, // destination endpoint ID (back to source chain)
        pad(address, { size: 32 }), // destination address
        amount, // amount to redeem (18 decimals)
        amount, // minimum amount to receive (same decimals for OFTUSDC)
        options, // LayerZero options
        '0x', // extra options
        '0x' // compose message
      ]
      
      // Quote the native fee
      let nativeFee: bigint
      try {
        const quoteResult = await publicClient.readContract({
          address: CONTRACTS.OFTUSDC as `0x${string}`,
          abi: OFT_USDC_ABI_ARRAY,
          functionName: 'quoteSend',
          args: [sendParam, false],
        })
        
        console.log('Quote result for redeem:', quoteResult)
        
        // Handle different return types
        if (Array.isArray(quoteResult)) {
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
      
      writeContract({
        address: CONTRACTS.OFTUSDC as `0x${string}`,
        abi: OFT_USDC_ABI_ARRAY,
        functionName: 'send',
        args: [sendParam, [nativeFee, BigInt(0)], address], // [nativeFee, lzTokenFee], refundTo
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Cross-Chain USDC Demo</h1>
          <p className="text-gray-600 mb-8">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Cross-Chain USDC Demo</h1>
          <p className="text-gray-600 mb-8">Please connect your wallet to continue</p>
        </div>
      </div>
    )
  }

  if (!contractsConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">⚠️ Configuration Required</h1>
          <p className="text-gray-600 mb-4">Contract addresses are not configured.</p>
          <p className="text-gray-600 mb-8">Please run the deployment script first:</p>
          <div className="bg-gray-100 p-4 rounded-lg text-left max-w-md mx-auto">
            <code className="text-sm">
              cd packages/contracts-evm<br/>
              npx hardhat run script/deploy-local.ts --network localhost
            </code>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🚀 Cross-Chain USDC Demo</h1>
          <p className="text-gray-600">Experience the complete LayerZero cross-chain flow: USDC → OFTUSDC → Cross-Chain Transfer → Property Vault → ShareOFT</p>
        </div>

        {/* User Balances */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">💰 Your Balances</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900">MockUSDC</h3>
              <p className="text-2xl font-bold text-blue-600">
                {usdcBalance ? formatUnits(usdcBalance as bigint, TOKEN_DECIMALS.USDC) : '0'} USDC
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-green-900">OFTUSDC</h3>
              <p className="text-2xl font-bold text-green-600">
                {oftBalance ? formatUnits(oftBalance as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-semibold text-purple-900">Vault Shares</h3>
              <p className="text-2xl font-bold text-purple-600">
                {vaultBalance ? formatUnits(vaultBalance as bigint, TOKEN_DECIMALS.VAULT_SHARES) : '0'} Shares
              </p>
            </div>
          </div>
        </div>

        {/* Vault Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">🏠 Property Vault Info</h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-700">
              <strong>Total Assets:</strong> {totalVaultAssets ? formatUnits(totalVaultAssets as bigint, TOKEN_DECIMALS.OFTUSDC) : '0'} OFTUSDC
            </p>
            <p className="text-gray-700">
              <strong>Vault Address:</strong> {CONTRACTS.PropertyVault}
            </p>
          </div>
        </div>

        {/* Step 1: USDC to OFTUSDC */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">🌉 Step 1: Send USDC Cross-Chain to Get OFTUSDC</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (USDC)
              </label>
              <input
                type="number"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter USDC amount"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={approveUSDC}
                disabled={isPending || !usdcAmount}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Approving...' : 'Approve USDC'}
              </button>
              <button
                onClick={sendUSDCCrossChain}
                disabled={isPending || quotingFee || !usdcAmount}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {quotingFee ? 'Quoting Fee...' : isPending ? 'Sending Cross-Chain...' : 'Send USDC Cross-Chain'}
              </button>
            </div>
            {usdcAllowance ? (
              <p className="text-sm text-gray-600">
                USDC Allowance: {formatUnits(usdcAllowance as bigint, TOKEN_DECIMALS.USDC)} USDC
              </p>
            ) : null}
          </div>
        </div>


        {/* Step 2: OFTUSDC to Vault */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">🏠 Step 2: Deposit OFTUSDC to Property Vault</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (OFTUSDC)
              </label>
              <input
                type="number"
                value={oftAmount}
                onChange={(e) => setOftAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter OFTUSDC amount"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={approveOFT}
                disabled={isPending || !oftAmount}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? 'Approving...' : 'Approve OFTUSDC'}
              </button>
              <button
                onClick={depositToVault}
                disabled={isPending || !oftAmount}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {isPending ? 'Depositing...' : 'Deposit to Vault'}
              </button>
            </div>
            {oftAllowance ? (
              <p className="text-sm text-gray-600">
                OFTUSDC Allowance: {formatUnits(oftAllowance as bigint, TOKEN_DECIMALS.OFTUSDC)} OFTUSDC
              </p>
            ) : null}
          </div>
        </div>

        {/* Step 3: Withdraw from Vault */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">💸 Step 3: Withdraw from Property Vault</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (Vault Shares)
              </label>
              <input
                type="number"
                value={vaultAmount}
                onChange={(e) => setVaultAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter vault shares amount"
              />
            </div>
            <button
              onClick={withdrawFromVault}
              disabled={isPending || !vaultAmount}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Withdrawing...' : 'Withdraw from Vault'}
            </button>
          </div>
        </div>

        {/* Step 4: Redeem OFTUSDC back to USDC */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">🔄 Step 4: Redeem OFTUSDC back to USDC</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OFTUSDC Amount to Redeem
              </label>
              <input
                type="number"
                value={oftAmount}
                onChange={(e) => setOftAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter OFTUSDC amount to redeem"
              />
            </div>
            <button
              onClick={redeemOFTUSDCToUSDC}
              disabled={isPending || quotingFee || !oftAmount}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              {quotingFee ? 'Quoting Fee...' : isPending ? 'Redeeming...' : 'Redeem OFTUSDC to USDC'}
            </button>
          </div>
        </div>

        {/* Transaction Status */}
        {(isPending || isConfirming) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-3"></div>
              <span className="text-yellow-800">
                {isPending ? 'Transaction pending...' : 'Waiting for confirmation...'}
              </span>
            </div>
          </div>
        )}

        {isConfirmed && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
            <div className="flex items-center">
              <div className="text-green-600 mr-3">✅</div>
              <span className="text-green-800">Transaction confirmed!</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="flex items-center">
              <div className="text-red-600 mr-3">❌</div>
              <span className="text-red-800">Error: {error.message}</span>
            </div>
          </div>
        )}

        {/* Flow Diagram */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4">🔄 Cross-Chain Flow</h2>
          <div className="flex items-center justify-center space-x-4 text-sm">
            <div className="bg-blue-100 px-4 py-2 rounded-lg">USDC</div>
            <div className="text-gray-400">→</div>
            <div className="bg-green-100 px-4 py-2 rounded-lg">OFTUSDC</div>
            <div className="text-gray-400">→</div>
            <div className="bg-purple-100 px-4 py-2 rounded-lg">Vault Shares</div>
            <div className="text-gray-400">→</div>
            <div className="bg-red-100 px-4 py-2 rounded-lg">Withdraw</div>
          </div>
        </div>
      </div>
    </div>
  )
}
