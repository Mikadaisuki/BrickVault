'use client'

import dynamic from 'next/dynamic'
import { Header } from '@/components/Header'
import { Building2, Settings, Activity, TrendingUp, Users, Globe } from 'lucide-react'
import Link from 'next/link'

// Dynamically import components that use wagmi hooks with SSR disabled
const PropertyOverview = dynamic(() => import('@/components/PropertyOverview').then(mod => ({ default: mod.PropertyOverview })), { ssr: false })

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            BrickVault Dashboard
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage your tokenized real estate investments
          </p>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Link href="/properties" className="bg-card rounded-lg border p-6 hover:border-primary transition-colors">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <h3 className="font-semibold">Properties</h3>
                <p className="text-sm text-muted-foreground">View and manage properties</p>
              </div>
            </div>
          </Link>

          <Link href="/contracts" className="bg-card rounded-lg border p-6 hover:border-primary transition-colors">
            <div className="flex items-center">
              <Settings className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <h3 className="font-semibold">Contracts</h3>
                <p className="text-sm text-muted-foreground">Monitor contract status</p>
              </div>
            </div>
          </Link>

          <Link href="/management" className="bg-card rounded-lg border p-6 hover:border-primary transition-colors">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <h3 className="font-semibold">Management</h3>
                <p className="text-sm text-muted-foreground">Platform administration</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Platform Overview
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Properties</span>
                  <span className="font-semibold">1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Vaults</span>
                  <span className="font-semibold">1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-semibold">Localhost</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Globe className="mr-2 h-5 w-5" />
                Quick Actions
              </h2>
              <div className="space-y-3">
                <Link href="/properties" className="block w-full bg-primary text-primary-foreground px-4 py-2 rounded-md text-center hover:bg-primary/90 transition-colors">
                  View Properties
                </Link>
                <Link href="/contracts" className="block w-full bg-secondary text-secondary-foreground px-4 py-2 rounded-md text-center hover:bg-secondary/90 transition-colors">
                  Check Contracts
                </Link>
                <Link href="/management" className="block w-full bg-outline border px-4 py-2 rounded-md text-center hover:bg-accent transition-colors">
                  Platform Management
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Property Preview */}
        <div className="mt-8">
          <PropertyOverview />
        </div>
      </main>
    </div>
  )
}
