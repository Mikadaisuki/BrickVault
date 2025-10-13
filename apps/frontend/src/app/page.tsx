'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { GridBackground } from '@/components/GridBackground'
import { BackgroundBeams } from '@/components/BackgroundBeams'
import { Header } from '@/components/Header'

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Header */}
      <div className="relative z-20">
        <Header />
      </div>
      
      {/* Background Effects */}
      <GridBackground />
      <BackgroundBeams />
      
      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-5xl mx-auto">
          {/* Animated Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-block"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/20 bg-blue-500/10 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              <span className="text-sm text-blue-300">Tokenized Real Estate Platform</span>
            </div>
          </motion.div>

          {/* Main Title with Gradient Effect */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h1 className="text-7xl md:text-9xl font-bold mb-6 tracking-tight">
              <span className="inline-block bg-gradient-to-r from-white via-blue-200 to-blue-400 bg-clip-text text-transparent">
                BrickVault
              </span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed"
          >
            The future of real estate investment powered by blockchain technology
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link href="/dashboard">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group relative px-8 py-4 bg-gradient-to-r from-blue-700 to-blue-600 rounded-full text-white font-semibold text-lg shadow-lg shadow-blue-600/50 hover:shadow-blue-600/70 transition-all duration-300 flex items-center gap-2"
              >
                <BookOpen className="w-5 h-5" />
                View Docs
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                
                {/* Animated border */}
                <span className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
              </motion.button>
            </Link>

            <Link href="/properties">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 border-2 border-blue-500/30 rounded-full text-white font-semibold text-lg hover:border-blue-500 hover:bg-blue-500/10 transition-all duration-300 backdrop-blur-sm"
              >
                Explore Properties
              </motion.button>
            </Link>
          </motion.div>

          {/* Floating Elements */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
          >
            {[
              { label: 'Cross-Chain', value: 'LayerZero', icon: '🌐' },
              { label: 'Blockchain', value: 'Ethereum & Stacks', icon: '⛓️' },
              { label: 'Security', value: 'Audited Contracts', icon: '🔒' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm hover:border-blue-500/40 hover:bg-blue-500/10 transition-all duration-300"
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="text-sm text-gray-400 mb-1">{item.label}</div>
                <div className="text-white font-semibold">{item.value}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Gradient Orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-3xl opacity-20 pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/30 rounded-full blur-3xl opacity-20 pointer-events-none" />
    </div>
  )
}
