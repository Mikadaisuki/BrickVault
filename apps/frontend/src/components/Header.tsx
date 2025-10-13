'use client'

import { Building2, Menu } from 'lucide-react'
import { SimpleConnectButton } from './SimpleConnectButton'
import { OwnerManagementLink } from './OwnerManagementLink'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-bold text-foreground">BrickVault</h1>
          </div>
          
          <nav className="hidden md:flex items-center space-x-6">
            <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </a>
            <a href="/properties" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Properties
            </a>
            <a href="/investments" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              My Investments
            </a>
            <a href="/balance" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Balance
            </a>
            <a href="/contracts" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Contracts
            </a>
            <OwnerManagementLink />
          </nav>
          
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <SimpleConnectButton />
            <button className="md:hidden">
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
