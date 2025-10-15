'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
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
          {/* Main Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-1"
          >
            {/* Dark mode logo */}
            <div className="dark:block hidden">
              <Image
                src="/BrickVault_white.png"
                alt="BrickVault"
                width={700}
                height={267}
                className="mx-auto max-w-full h-auto"
                priority
              />
            </div>
            {/* Light mode logo */}
            <div className="dark:hidden block">
              <Image
                src="/BrickVault_black.png"
                alt="BrickVault"
                width={700}
                height={267}
                className="mx-auto max-w-full h-auto"
                priority
              />
            </div>
          </motion.div>

          {/* Animated Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-1 inline-block"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/20 bg-blue-500/10 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              <span className="text-lg text-blue-300">Cross-Chain Tokenized Real Estate Platform</span>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link href="/docs">
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
        </div>
      </div>

      {/* Gradient Orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-3xl opacity-20 pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/30 rounded-full blur-3xl opacity-20 pointer-events-none" />
    </div>
  )
}
