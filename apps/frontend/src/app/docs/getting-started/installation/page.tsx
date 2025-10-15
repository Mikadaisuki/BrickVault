'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Terminal } from 'lucide-react'

export default function InstallationPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Installation
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📹 Video Tutorial Coming Soon
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          A step-by-step video guide for installation will be available here.
        </p>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Prerequisites
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        Before getting started with BrickVault, ensure you have:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>A Web3 wallet (MetaMask, WalletConnect, etc.)</li>
        <li>Some tokens on supported chains for gas fees</li>
        <li>Basic understanding of blockchain and smart contracts</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Wallet Setup
      </h2>
      <div className="bg-gray-900 dark:bg-gray-950 border border-gray-700 rounded-lg p-4 my-4">
        <div className="flex items-center space-x-2 mb-2">
          <Terminal className="w-4 h-4 text-green-400" />
          <span className="text-sm text-gray-400">Installation Steps</span>
        </div>
        <pre className="text-green-400 text-sm">
          <code>{`1. Install a Web3 wallet extension
2. Create or import your wallet
3. Connect to supported networks
4. Fund your wallet with tokens`}</code>
        </pre>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Supported Networks
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        BrickVault currently supports:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>Ethereum (Sepolia Testnet)</li>
        <li>BNB Chain (Testnet)</li>
        <li>Stacks Blockchain</li>
      </ul>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-8">
        <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
          Next Steps
        </h3>
        <Link 
          href="/docs/getting-started/quick-start"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          Continue to Quick Start
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
    </div>
  )
}

