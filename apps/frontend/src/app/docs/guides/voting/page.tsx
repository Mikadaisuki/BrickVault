'use client'

import React from 'react'

export default function VotingGuidePage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Voting Guide
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📹 Voting Tutorial Coming Soon
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Learn how to participate in governance through our video guide.
        </p>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-lg">
        Participate in property governance by voting on proposals and decisions 
        that affect your investments.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        How to Vote
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        Follow these steps to cast your vote:
      </p>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-6">
        <ol className="space-y-3 mb-0">
          <li className="text-gray-600 dark:text-gray-400">
            Navigate to the property's DAO page
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            Review active proposals and their details
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            Click on a proposal to see full information
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            Cast your vote (For, Against, or Abstain)
          </li>
          <li className="text-gray-600 dark:text-gray-400">
            Confirm the transaction in your wallet
          </li>
        </ol>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Types of Proposals
      </h2>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li><strong className="text-gray-900 dark:text-white">Property Improvements</strong> - Renovations, upgrades, or maintenance</li>
        <li><strong className="text-gray-900 dark:text-white">Financial Decisions</strong> - Rental rates, refinancing, or sale</li>
        <li><strong className="text-gray-900 dark:text-white">Management Changes</strong> - Property manager selection or policies</li>
        <li><strong className="text-gray-900 dark:text-white">Distribution Changes</strong> - Income distribution policies</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Voting Power
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        Your voting power is determined by:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>The number of property tokens you hold</li>
        <li>One token = One vote</li>
        <li>Voting power is snapshotted when proposal is created</li>
      </ul>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-8">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📊 Participation Matters
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm mb-0">
          Active participation in governance helps ensure properties are managed in the 
          best interest of all token holders.
        </p>
      </div>
    </div>
  )
}

