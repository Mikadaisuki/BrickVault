'use client'

import React from 'react'
import Link from 'next/link'
import { Play, Wallet, Search, DollarSign } from 'lucide-react'

export default function QuickStartPage() {
  const steps = [
    {
      icon: <Wallet className="w-6 h-6" />,
      title: 'Connect Your Wallet',
      description: 'Click the "Connect Wallet" button in the top right corner',
    },
    {
      icon: <Search className="w-6 h-6" />,
      title: 'Browse Properties',
      description: 'Explore available properties and their tokenization details',
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      title: 'Make Your Investment',
      description: 'Purchase property tokens and start earning',
    },
  ]

  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Quick Start Guide
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <div className="flex items-center space-x-2 mb-2">
          <Play className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <p className="text-blue-900 dark:text-blue-100 font-medium mb-0">
            📹 Video Tutorial Coming Soon
          </p>
        </div>
        <p className="text-blue-700 dark:text-blue-300 text-sm mb-0">
          Watch a quick walkthrough video to get started with BrickVault in minutes.
        </p>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Getting Started in 3 Steps
      </h2>

      <div className="space-y-6 my-8">
        {steps.map((step, index) => (
          <div 
            key={index}
            className="flex items-start space-x-4 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg"
          >
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                {step.icon}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                {step.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-0">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        What's Next?
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        Now that you're set up, explore more advanced features:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>
          <Link href="/docs/concepts/property-tokens" className="text-blue-600 dark:text-blue-400 hover:underline">
            Learn about Property Tokenization
          </Link>
        </li>
        <li>
          <Link href="/docs/concepts/cross-chain" className="text-blue-600 dark:text-blue-400 hover:underline">
            Explore Cross-Chain Capabilities
          </Link>
        </li>
        <li>
          <Link href="/docs/concepts/governance" className="text-blue-600 dark:text-blue-400 hover:underline">
            Understand DAO Governance
          </Link>
        </li>
      </ul>

      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 my-8">
        <p className="text-yellow-900 dark:text-yellow-100 font-medium mb-2">
          ⚠️ Testnet Notice
        </p>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-0">
          BrickVault is currently running on testnets. Use testnet tokens only.
        </p>
      </div>
    </div>
  )
}

