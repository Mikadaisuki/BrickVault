'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Terminal } from 'lucide-react'

export default function WhyIBuiltBrickVaultPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Why I Built BrickVault
      </h1>
      
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-3">
          🏗️ A Personal Journey into Blockchain Real Estate
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          The story behind building a decentralized platform for real estate tokenization and investment.
        </p>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        The Problem I Wanted to Solve
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Traditional real estate investment has always been exclusive, expensive, and complex. The main challenges I identified were:
      </p>
      <ul className="space-y-2 text-gray-600 dark:text-gray-400 my-4">
        <li>High barriers to entry for real estate investment</li>
        <li>Lack of liquidity in property markets</li>
        <li>Complex legal and administrative processes</li>
        <li>Limited transparency in property transactions</li>
        <li>Geographic limitations on investment opportunities</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Three Key Validations That Shaped My Journey
      </h2>

      <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-white">
        1. Market Gap Discovery
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Two months ago, I discovered <a href="https://lend.xyz/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Lend.xyz</a> and was inspired by their vision for tokenized real estate. However, at that time they didn't even have a demo or MVP, which made me realize there was a significant gap in the market.
      </p>

      <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-white">
        2. Community Validation
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        I saw similar tokenized real estate ideas in hackathon projects, including "RealEstateStack: Tokenized Property Trading" on the Stacks blockchain. This confirmed that the concept was not only viable but actively being explored by the developer community.
      </p>
      
      <div className="my-6">
        <img 
          src="/image.png" 
          alt="RealEstateStack: Tokenized Property Trading hackathon project" 
          className="w-full max-w-md mx-auto rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
        />
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
          RealEstateStack hackathon project showing tokenized property trading concept
        </p>
      </div>

      <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-white">
        3. Technical Foundation
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        A friend who works at LayerZero validated my concept and introduced me to their cross-chain infrastructure products, particularly the <a href="https://docs.layerzero.network/v2/developers/evm/oft/quickstart" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Omnichain Fungible Token (OFT) Standard</a>. This laid the technical foundation for my cross-chain architecture.
      </p>


      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Why BrickVault is Different
      </h2>
      
      <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 border border-green-200 dark:border-green-800 rounded-lg p-6 my-6">
        <h3 className="text-lg font-semibold mb-3 text-green-900 dark:text-green-100">
          🚀 Key Advantages Over Competitors
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-green-200 dark:border-green-700">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
              ✅ No New Token Risk
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              While <a href="https://lendxyz.gitbook.io/lend" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Lend.xyz requires users to trust their new opLend token</a>, BrickVault uses established ERC20 tokens throughout the entire flow.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-green-200 dark:border-green-700">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
              🌐 Universal Cross-Chain
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Supports sBTC, BTC, and all EVM chains - serving the two largest crypto communities with true interoperability.
            </p>
          </div>
        </div>
      </div>

      <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-white">
        Technical Advantages
      </h3>
      <ul className="space-y-3 text-gray-600 dark:text-gray-400 my-4">
        <li className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <strong>Built on Proven Infrastructure:</strong> Uses established ERC20 tokens, eliminating the need for users to trust new, unproven tokens
          </div>
        </li>
        <li className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <strong>LayerZero Integration:</strong> Leverages battle-tested cross-chain infrastructure for seamless asset transfers
          </div>
        </li>
        <li className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <strong>Smart Contract Governance:</strong> Decentralized decision-making without proprietary token dependencies
          </div>
        </li>
        <li className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <strong>Transparent Asset Management:</strong> All transactions and ownership verifiable on-chain using standard tokens
          </div>
        </li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Why This Matters
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Real estate represents one of the largest asset classes globally, yet remains largely inaccessible to everyday investors. 
        By tokenizing properties and enabling fractional ownership, BrickVault opens doors that were previously closed.
      </p>
      <p className="text-gray-600 dark:text-gray-400">
        This isn't just about technology—it's about financial inclusion, economic empowerment, and creating opportunities 
        for wealth building that weren't possible before blockchain technology.
      </p>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-8">
        <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
          Join the Journey
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Building the future of real estate investment, one property token at a time.
        </p>
        <Link 
          href="/docs/getting-started/quick-start"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          Start Your Investment Journey
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
    </div>
  )
}

