'use client'

import React from 'react'

export default function ManagingPropertiesPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Managing Properties
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📹 Management Tutorial Coming Soon
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Learn how to manage your property investments through video tutorials.
        </p>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-lg">
        As a property owner or manager, you have access to various tools for managing 
        tokenized properties on BrickVault.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Owner Dashboard
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        The owner dashboard provides comprehensive tools for:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400">
        <li>Creating new property tokens</li>
        <li>Managing token distribution</li>
        <li>Distributing rental income</li>
        <li>Monitoring property performance</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Key Management Tasks
      </h2>
      
      <div className="space-y-4 my-6">
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            Property Registration
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-0">
            Register new properties with detailed information, valuation, and tokenization parameters
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            Income Distribution
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-0">
            Distribute rental income to token holders proportionally and automatically
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            Analytics & Reporting
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-0">
            Access detailed analytics on property performance, token distribution, and investor activity
          </p>
        </div>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 my-8">
        <p className="text-yellow-900 dark:text-yellow-100 font-medium mb-2">
          💡 Pro Tip
        </p>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-0">
          Regular income distributions and transparent reporting help maintain investor confidence 
          and property value.
        </p>
      </div>
    </div>
  )
}

