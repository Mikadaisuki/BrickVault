'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GuidesPage() {
  const router = useRouter()
  
  useEffect(() => {
    router.push('/docs/guides/investing')
  }, [router])
  
  return null
}

