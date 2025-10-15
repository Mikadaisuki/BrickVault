'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ConceptsPage() {
  const router = useRouter()
  
  useEffect(() => {
    router.push('/docs/concepts/property-tokens')
  }, [router])
  
  return null
}

