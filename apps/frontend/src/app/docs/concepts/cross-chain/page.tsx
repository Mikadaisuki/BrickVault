'use client'

import React from 'react'

export default function CrossChainPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Cross-Chain Capabilities
      </h1>
      

      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 my-6">
        <p className="text-yellow-900 dark:text-yellow-100 font-medium mb-2">
          📝 Implementation Note
        </p>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-0">
          Currently using <strong>BSC Testnet</strong> as spoke chain. All EVM chains are theoretically adaptable via LayerZero OFT.
        </p>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-lg">
        BrickVault operates on a hub-and-spoke model with <strong className="text-gray-900 dark:text-white">Sepolia as the central hub</strong>, 
        connecting multiple spoke chains and Stacks blockchain for seamless cross-chain property investment.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Cross-Chain Architecture
      </h2>
      
      <div className="space-y-6">
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-l-4 border-blue-500 dark:border-blue-400 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
            🌐 Spoke Chains(BSC or other) → Hub (Sepolia)
          </h3>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>User deposits USDC on spoke chain (BSC, others)</span>
            </div>
            <div className="flex justify-center">
              <span className="text-blue-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>USDC locked in <strong>OFT Adapter Lockbox</strong> on spoke chain</span>
            </div>
            <div className="flex justify-center">
              <span className="text-blue-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span>LayerZero message sent to Sepolia hub</span>
            </div>
            <div className="flex justify-center">
              <span className="text-blue-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <span>USDC <strong>wrapped to HUB OFTUSDC</strong> on Sepolia hub for user</span>
            </div>
            <div className="flex justify-center">
              <span className="text-blue-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
              <span>User can invest in properties using <strong>HUB OFTUSDC</strong></span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-l-4 border-purple-500 dark:border-purple-400 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
            ⛓️ Stacks → Hub (Sepolia)
          </h3>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>User deposits sBTC on Stacks blockchain</span>
            </div>
            <div className="flex justify-center">
              <span className="text-purple-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>sBTC locked in <strong>Stacks Gateway</strong> contract</span>
            </div>
            <div className="flex justify-center">
              <span className="text-purple-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span><strong>Relayer</strong> processes cross-chain message</span>
            </div>
            <div className="flex justify-center">
              <span className="text-purple-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <span><strong>Stacks Manager</strong> receives message on Sepolia</span>
            </div>
            <div className="flex justify-center">
              <span className="text-purple-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
              <span>User receives equivalent USDC for property investment</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border-l-4 border-red-500 dark:border-red-400 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
            💰 Hub (Sepolia) → Spoke Chains (Liquidation)
          </h3>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>Property <strong>liquidated</strong> on Sepolia hub (sold/auctioned)</span>
            </div>
            <div className="flex justify-center">
              <span className="text-red-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>Sale proceeds converted to <strong>HUB OFTUSDC</strong></span>
            </div>
            <div className="flex justify-center">
              <span className="text-red-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span>Investors claim their share of liquidation proceeds</span>
            </div>
            <div className="flex justify-center">
              <span className="text-red-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <span><strong>LayerZero</strong> message sent to spoke chains for withdrawal</span>
            </div>
            <div className="flex justify-center">
              <span className="text-red-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
              <span>USDC <strong>unlocked from lockbox</strong> on spoke chains</span>
            </div>
            <div className="flex justify-center">
              <span className="text-red-500">↓</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">6</span>
              <span>Investors receive <strong>USDC directly</strong> to their wallets</span>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Key Features
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            🔒 Lockbox Model
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Original tokens are locked in secure contracts on source chains, while equivalent tokens are minted on destination chains, ensuring no double-spending and maintaining total supply integrity.
          </p>
        </div>
        
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            💰 One-Way Charge Deposit
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Users pay gas fees only on the source chain when depositing. No additional fees required on the destination chain, making cross-chain transfers cost-effective.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Supported Chains
      </h2>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>✅ <strong className="text-gray-900 dark:text-white">Sepolia (Hub)</strong> - Central hub for all operations</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">BSC Testnet (Spoke)</strong> - LayerZero OFT integration</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">Other EVM Chains (Spoke)</strong> - LayerZero OFT integration</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">Stacks (Bridge)</strong> - Gateway contract integration</li>
      </ul>

      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 my-8">
        <p className="text-yellow-900 dark:text-yellow-100 font-medium mb-2">
          💡 Hub-Spoke Benefits
        </p>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-0">
          The hub-and-spoke model centralizes property operations on Sepolia while enabling global access through spoke chains, 
          ensuring consistent governance and efficient cross-chain asset management.
        </p>
      </div>
    </div>
  )
}

