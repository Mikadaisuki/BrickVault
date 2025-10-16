'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronDown, ChevronRight, BookOpen, Home, Github } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

interface NavItem {
  title: string
  href: string
  items?: NavItem[]
}

const navigation: NavItem[] = [
  {
    title: 'Getting Started',
    href: '/docs/getting-started',
    items: [
      { title: 'Introduction', href: '/docs/getting-started/introduction' },
      { title: 'Why I Built BrickVault', href: '/docs/getting-started/installation' },
      { title: 'Video Demo', href: '/docs/getting-started/quick-start' },
    ],
  },
  {
    title: 'Core Concepts',
    href: '/docs/concepts',
    items: [
      { title: 'Property Tokenization', href: '/docs/concepts/property-tokens' },
      { title: 'Cross-Chain', href: '/docs/concepts/cross-chain' },
      { title: 'Governance', href: '/docs/concepts/governance' },
    ],
  },
  {
    title: 'Guides',
    href: '/docs/guides',
    items: [
      { title: 'Investing', href: '/docs/guides/investing' },
      { title: 'Managing Properties', href: '/docs/guides/managing-properties' },
      { title: 'Voting', href: '/docs/guides/voting' },
    ],
  },
]

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(true)
  const isActive = pathname === item.href
  const hasChildren = item.items && item.items.length > 0

  return (
    <div className="mb-1">
      <div className="flex items-center">
        {hasChildren && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
        )}
        <Link
          href={item.href}
          className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
            isActive
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          } ${!hasChildren ? 'ml-5' : ''}`}
          style={{ paddingLeft: hasChildren ? '12px' : `${depth * 16 + 12}px` }}
        >
          {item.title}
        </Link>
      </div>
      {hasChildren && isOpen && (
        <div className="ml-4 mt-1 space-y-1">
          {item.items?.map((child) => (
            <NavLink key={child.href} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
              >
                {sidebarOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
              <Link href="/" className="flex items-center space-x-2">
                <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <span className="font-bold text-lg">BrickVault Docs</span>
              </Link>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </Link>
              <Link
                href="https://github.com/Mikadaisuki/BrickVault"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <Github className="w-4 h-4" />
                <span className="hidden sm:inline">GitHub</span>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside
            className={`${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:translate-x-0 fixed lg:sticky top-16 left-0 z-40 w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 lg:bg-transparent transition-transform duration-200 py-8`}
          >
            <nav className="space-y-2 px-4">
              {navigation.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </nav>
          </aside>

          {/* Overlay for mobile */}
          {sidebarOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30 top-16"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main content */}
          <main className="flex-1 py-8 min-w-0 max-w-4xl">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

