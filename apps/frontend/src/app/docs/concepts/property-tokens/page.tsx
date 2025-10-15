'use client'

import React from 'react'

export default function PropertyTokenizationPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Property Tokenization
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📹 Video Explanation Coming Soon
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          A detailed video explaining property tokenization will be available here.
        </p>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-lg">
        BrickVault uses a sophisticated multi-layer tokenization architecture to represent real estate assets on the blockchain, 
        combining industry-standard token protocols for maximum flexibility and composability.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Tokenization Architecture
      </h2>
      
      <div className="space-y-4">
        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-l-4 border-green-500 dark:border-green-400 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            1. ERC-4626 Vault Standard
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            Each property owns its own <strong className="text-gray-900 dark:text-white">ERC-4626 vault deployed on-chain</strong>:
          </p>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-4">
            <li>• Standardized deposit/withdraw interface</li>
            <li>• Automatic share calculation based on contribution</li>
            <li>• Composable with DeFi protocols</li>
            <li>• Built-in accounting and NAV management</li>
          </ul>
        </div>

        <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-l-4 border-purple-500 dark:border-purple-400 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            2. ERC-20 Token
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            <strong className="text-gray-900 dark:text-white">ERC-20 tokens</strong> represent multiple asset types in the ecosystem:
          </p>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-4">
            <li>• <strong>USDC</strong> - Stable currency for deposits and investments</li>
            <li>• <strong>OFT (Omnichain Fungible Token)</strong> - Cross-chain transferable tokens via LayerZero</li>
            <li>• <strong>Property Shares</strong> - Tradeable ownership tokens with voting and dividend rights</li>
            <li>• Fully composable with DeFi protocols and DEXs</li>
          </ul>
        </div>

        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-l-4 border-blue-500 dark:border-blue-400 rounded-lg">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            3. ERC-721 Property Token
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            After property purchase, a unique <strong className="text-gray-900 dark:text-white">ERC-721 NFT</strong> is created and 
            <strong className="text-gray-900 dark:text-white"> owned by the vault</strong>. This token represents the property's NAV for tracking:
          </p>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-4">
            <li>• Net Asset Value (NAV) tracking and updates</li>
            <li>• Property metadata (address, type, size)</li>
            <li>• Property valuation history</li>
            <li>• Owned and managed by the vault contract</li>
          </ul>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        How Tokenization Works
      </h2>
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-6">
        <ol className="space-y-4 text-gray-700 dark:text-gray-300">
          <li>
            <strong className="text-gray-900 dark:text-white">Property Registration:</strong> A real estate property is registered 
            and minted as an ERC-721 token with complete property details and initial valuation
          </li>
          <li>
            <strong className="text-gray-900 dark:text-white">Vault Creation:</strong> An ERC-4626 vault is deployed and linked 
            to the property token, establishing the investment structure
          </li>
          <li>
            <strong className="text-gray-900 dark:text-white">Investor Deposits:</strong> Investors deposit USDC into the vault 
            and receive proportional ERC-20 share tokens
          </li>
          <li>
            <strong className="text-gray-900 dark:text-white">Share Distribution:</strong> ERC-20 shares represent fractional 
            ownership and can be freely traded or held for income
          </li>
          <li>
            <strong className="text-gray-900 dark:text-white">Ongoing Management:</strong> NAV updates, income distributions, 
            and governance decisions are all managed on-chain
          </li>
        </ol>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Benefits of This Approach
      </h2>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>✅ <strong className="text-gray-900 dark:text-white">Fractional ownership</strong> of high-value properties</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">Increased liquidity</strong> through tradeable tokens</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">Transparent ownership</strong> records on blockchain</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">Automated distributions</strong> of rental income</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">Cross-chain compatibility</strong> for global access</li>
        <li>✅ <strong className="text-gray-900 dark:text-white">DeFi composability</strong> with existing protocols</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Token Benefits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            For Investors
          </h3>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Lower entry barriers</li>
            <li>Portfolio diversification</li>
            <li>Passive income generation</li>
          </ul>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            For Property Manager
          </h3>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Increased liquidity</li>
            <li>Access to capital</li>
            <li>Transparent management</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

