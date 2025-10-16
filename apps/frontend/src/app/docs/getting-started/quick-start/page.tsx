'use client'

import React from 'react'
import Link from 'next/link'
import { Play, ArrowLeft, ArrowRight } from 'lucide-react'

export default function VideoDemoPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Video Demo
      </h1>
      

      {/* Video Player */}
      <div className="my-8">
        <div className="relative bg-black rounded-lg overflow-hidden shadow-lg">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              src="https://www.youtube.com/embed/6EC4nemkdYw"
              title="BrickVault Demo Video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </div>

      {/* Key Features Shown in Video */}
      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        What You'll See in This Demo
      </h2>
      <div className="grid md:grid-cols-2 gap-4 my-6">
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            🏠 Property Browsing
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Explore available properties with detailed information and investment opportunities.
          </p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            💰 Easy Investment
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            See how simple it is to purchase property tokens and start earning returns.
          </p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            🔗 Cross-Chain Support
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Experience seamless transactions across multiple blockchain networks.
          </p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            🗳️ Governance Features
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Learn how token holders participate in property management decisions.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
        <Link 
          href="/docs/getting-started/installation"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Why I Built BrickVault
        </Link>
        
        <Link 
          href="/docs/concepts/property-tokens"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          Learn About Property Tokens
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>

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

