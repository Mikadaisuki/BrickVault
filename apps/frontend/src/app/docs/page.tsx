'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Zap, Shield, Globe } from 'lucide-react'
import { motion } from 'framer-motion'

export default function DocsPage() {
  const features = [
    {
      icon: <BookOpen className="w-6 h-6" />,
      title: 'Getting Started',
      description: 'Learn the basics and get up and running quickly',
      href: '/docs/getting-started/introduction',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Core Concepts',
      description: 'Understand property tokenization and key concepts',
      href: '/docs/concepts/property-tokens',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Guides',
      description: 'Step-by-step guides for common tasks',
      href: '/docs/guides/investing',
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: 'Cross-Chain',
      description: 'Explore cross-chain functionality',
      href: '/docs/concepts/cross-chain',
    },
  ]

  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
          Welcome to BrickVault Documentation
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Your guide to tokenized real estate investment with cross-chain capabilities
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6 my-12"
      >
        {features.map((feature, index) => (
          <Link
            key={index}
            href={feature.href}
            className="group no-underline block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-200 hover:shadow-lg bg-white dark:bg-gray-900"
          >
            <div className="flex items-start space-x-4">
              <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                {feature.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {feature.description}
                </p>
                <div className="flex items-center text-sm text-blue-600 dark:text-blue-400">
                  <span>Learn more</span>
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-12 p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg"
      >
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          What is BrickVault?
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          BrickVault is a fully cross-chain tokenized property platform operating seamlessly across 
          Stacks and all EVM-compatible blockchains. The entire property lifecycle—from tokenization 
          and investment to governance and revenue distribution—is completed entirely on-chain, 
          making BrickVault a truly DeFi-native real estate platform.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8"
      >
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Quick Links
        </h2>
        <ul className="space-y-2">
          <li>
            <Link 
              href="/docs/getting-started/introduction" 
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Introduction to BrickVault
            </Link>
          </li>
          <li>
            <Link 
              href="/docs/getting-started/installation" 
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Installation Guide
            </Link>
          </li>
          <li>
            <Link 
              href="/docs/concepts/property-tokens" 
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Understanding Property Tokenization
            </Link>
          </li>
        </ul>
      </motion.div>
    </div>
  )
}

