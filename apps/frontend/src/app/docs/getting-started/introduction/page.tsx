'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

export default function IntroductionPage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        Introduction to BrickVault
      </h1>
      

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        What is BrickVault?
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        BrickVault is a <strong className="text-gray-900 dark:text-white">cross-chain</strong> tokenized property platform operating on <strong className="text-gray-900 dark:text-white">Stacks and EVM all-chains</strong>. The entire 
        property <strong className="text-gray-900 dark:text-white">lifecycle is completed fully on-chain</strong>, making it a truly DeFi-native real estate platform.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Key Features
      </h2>
      <div className="grid grid-cols-1 gap-4 my-6">
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-l-4 border-blue-500 dark:border-blue-400 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">🌐</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Cross-Chain Support</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong className="text-gray-900 dark:text-white">Stacks gateway contract</strong> and <a href="https://docs.layerzero.network/v2/developers/evm/oft/quickstart" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-bold">LayerZero OFT</a> enable seamless transfers between Stacks and EVM all-chains
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-l-4 border-green-500 dark:border-green-400 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">🏠</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Tokenized Properties</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Properties tokenized using <strong className="text-gray-900 dark:text-white">ERC-4626</strong> vault standard, <strong className="text-gray-900 dark:text-white">ERC-721</strong> property tokens, and <strong className="text-gray-900 dark:text-white">ERC-20</strong> shares
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-l-4 border-purple-500 dark:border-purple-400 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">🗳️</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">DAO Governance</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Each property controlled by investors through a <strong className="text-gray-900 dark:text-white">DAO contract</strong>, enabling investors to decide the entire property lifecycle and achieve true DeFi
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border-l-4 border-yellow-500 dark:border-yellow-400 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">💰</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Automated Distributions</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Investors earn <strong className="text-gray-900 dark:text-white">high income</strong> from rent and property revenue through <strong className="text-gray-900 dark:text-white">tradeable share portions</strong>, with distributions automatically sent to their wallets
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        BrickVault Architecture
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        One diagram to understand BrickVault's cross-chain architecture:
      </p>
      
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-6">
        <Image
          src="/Workflow.png"
          alt="BrickVault Cross-Chain Architecture Workflow"
          width={1200}
          height={800}
          className="w-full h-auto rounded-lg shadow-lg"
          priority
        />
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-8">
        <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
          Next Steps
        </h3>
        <Link 
          href="/docs/getting-started/installation"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          Learn Why I Built BrickVault
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
    </div>
  )
}

