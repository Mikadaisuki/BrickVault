'use client'

import React from 'react'

export default function GovernancePage() {
  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
        DAO Governance
      </h1>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
        <p className="text-blue-900 dark:text-blue-100 font-medium mb-2">
          📹 Video Guide Coming Soon
        </p>
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          A comprehensive guide on governance and voting will be available here.
        </p>
      </div>

      <p className="text-gray-600 dark:text-gray-400 text-lg">
        BrickVault properties are fully controlled by investors through <strong className="text-gray-900 dark:text-white">DAO contracts</strong>. 
        The entire property lifecycle—from fundraising to liquidation—is decided through on-chain governance, 
        giving investors complete control over their investments.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Property Lifecycle Governance
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        The five stages of property lifecycle, each controlled by investor voting through DAO:
      </p>

      <div className="space-y-6">
        <div className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-l-4 border-blue-500 dark:border-blue-400 rounded-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-2xl">1️⃣</span> Fundraising Stage
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">👥 Investors:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Deposit USDC to property vault</li>
                <li>• Receive proportional share tokens</li>
                <li>• Monitor fundraising progress</li>
                <li>• Vote on fundraising target and deadline</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">🏗️ Platform:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Deploy ERC-4626 vault contract on-chain</li>
                <li>• Calculate and mint share tokens automatically</li>
                <li>• Track total raised amount in real-time</li>
                <li>• Execute fundraising completion when target met</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-l-4 border-green-500 dark:border-green-400 rounded-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-2xl">2️⃣</span> Property Purchase
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">👥 Investors:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Vote on property selection proposal</li>
                <li>• Approve purchase price and terms</li>
                <li>• Vote to execute purchase transaction</li>
                <li>• Monitor purchase completion status</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">🏗️ Platform:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Execute purchase via DAO contract</li>
                <li>• Mint ERC-721 property NFT to vault</li>
                <li>• Set initial NAV (Net Asset Value)</li>
                <li>• Record property metadata on-chain</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-l-4 border-purple-500 dark:border-purple-400 rounded-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-2xl">3️⃣</span> Property Management
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">👥 Investors:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Vote on property manager selection</li>
                <li>• Approve maintenance and renovation budgets</li>
                <li>• Set rental rates and tenant policies</li>
                <li>• Vote on major property decisions</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">🏗️ Platform:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Execute approved management actions</li>
                <li>• Track property expenses on-chain</li>
                <li>• Update NAV based on property value changes</li>
                <li>• Record all management decisions immutably</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border-l-4 border-yellow-500 dark:border-yellow-400 rounded-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-2xl">4️⃣</span> Liquidating
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">👥 Investors:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Propose property sale or auction</li>
                <li>• Vote on liquidation strategy and timing</li>
                <li>• Approve final sale price and buyer</li>
                <li>• Monitor liquidation process</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">🏗️ Platform:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Execute sale via DAO contract</li>
                <li>• Process property transfer on-chain</li>
                <li>• Convert proceeds to USDC</li>
                <li>• Prepare final distribution calculation</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-l-4 border-red-500 dark:border-red-400 rounded-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-2xl">5️⃣</span> Liquidated
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">👥 Investors:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Claim final liquidation proceeds</li>
                <li>• Receive proportional USDC distribution</li>
                <li>• Share tokens automatically burned</li>
                <li>• Investment cycle complete</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">🏗️ Platform:</h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• Distribute final proceeds to all shareholders</li>
                <li>• Execute cross-chain transfers if needed</li>
                <li>• Burn all share tokens automatically</li>
                <li>• Close vault contract permanently</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Investor Rights by Lifecycle Stage
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        The following table shows what actions investors can perform at each stage of the property lifecycle:
      </p>
      
      <div className="overflow-x-auto my-6">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                Lifecycle Stage
              </th>
              <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                Deposit (Buy Shares)
              </th>
              <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                Withdraw Shares
              </th>
              <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                Withdraw Rent
              </th>
              <th className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                Voting Rights
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-blue-50 dark:bg-blue-950/20">
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                1️⃣ Fundraising
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Open - Deposit USDC anytime</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Open - Withdraw before purchase</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">No rent yet</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Vote on fundraising terms</p>
              </td>
            </tr>
            
            <tr className="bg-green-50 dark:bg-green-950/20">
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                2️⃣ Property Purchase
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Closed - Vault locked for purchase</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Closed - Vault locked for purchase</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">No rent yet</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Vote on property selection & price</p>
              </td>
            </tr>
            
            <tr className="bg-purple-50 dark:bg-purple-950/20">
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                3️⃣ Property Management
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-orange-600 dark:text-orange-400 font-bold text-lg">📊</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Secondary market only (DEX/OTC)</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-orange-600 dark:text-orange-400 font-bold text-lg">📊</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Secondary market only (DEX/OTC)</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Claim accumulated rent anytime</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Vote on all management decisions</p>
              </td>
            </tr>
            
            <tr className="bg-yellow-50 dark:bg-yellow-950/20">
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                4️⃣ Liquidating
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Closed - Liquidation in progress</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Closed - Liquidation in progress</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Closed - Liquidation in progress</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Vote on liquidation strategy</p>
              </td>
            </tr>
            
            <tr className="bg-red-50 dark:bg-red-950/20">
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                5️⃣ Liquidated
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Closed - Vault closed</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Claim final liquidation proceeds</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Final distribution included</p>
              </td>
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-3 text-center">
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Vault closed - No more voting</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 my-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
          📝 Legend
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-green-600 dark:text-green-400 font-bold text-lg">✅</span>
            <span className="text-gray-700 dark:text-gray-300">Available - Direct vault interaction</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-orange-600 dark:text-orange-400 font-bold text-lg">📊</span>
            <span className="text-gray-700 dark:text-gray-300">Secondary Market - Trade on DEX/OTC</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-red-600 dark:text-red-400 font-bold text-lg">❌</span>
            <span className="text-gray-700 dark:text-gray-300">Closed - Not available at this stage</span>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">
        Voting Power & Rights
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            📊 Voting Power
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your voting power is proportional to your share tokens. <strong>1 share = 1 vote</strong>. 
            All votes are recorded on-chain and executed automatically via smart contracts.
          </p>
        </div>
        
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            🔒 Trustless Execution
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Once a proposal passes, it's <strong>automatically executed</strong> by the DAO contract. 
            No intermediaries needed—true DeFi governance from start to finish.
          </p>
        </div>
      </div>
    </div>
  )
}

