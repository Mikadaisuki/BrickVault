'use client'

import React from 'react'

export default function InvestingGuidePage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Investing Guide
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📹 Investment Tutorial Coming Soon
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Watch step-by-step video guidance on making your first investment.
        </p>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-lg">
        Learn how to invest in tokenized real estate properties through BrickVault.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Before You Invest
      </h2>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>Ensure your wallet is connected and funded</li>
        <li>Review property details and financials</li>
        <li>Understand the risks and terms</li>
        <li>Check available token supply</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Investment Process
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        Follow these steps to make an investment:
      </p>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-6">
        <ol className="space-y-4">
          <li className="text-gray-600 dark:text-gray-400">
            <strong className="text-gray-900 dark:text-white">Browse Properties</strong> - 
            Navigate to the Properties page and explore available investments
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            <strong className="text-gray-900 dark:text-white">Select Amount</strong> - 
            Choose how many tokens you want to purchase
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            <strong className="text-gray-900 dark:text-white">Approve Transaction</strong> - 
            Confirm the transaction in your wallet
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            <strong className="text-gray-900 dark:text-white">Track Investment</strong> - 
            Monitor your investment in the My Investments section
          </li>
        </ol>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Risk Considerations
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        As with all investments, consider:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>Market volatility and liquidity risks</li>
        <li>Property-specific risks (location, condition, market)</li>
        <li>Smart contract and technology risks</li>
        <li>Regulatory and legal considerations</li>
      </ul>
    </div>
  )
}

