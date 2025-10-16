'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DocsPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to Getting Started Introduction
    router.replace('/docs/getting-started/introduction')
  }, [router])

  return (
    <div className="prose prose-gray dark:prose-invert max-w-none">
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Redirecting to Getting Started...</p>
        </div>
      </div>
    </div>
  )
}

