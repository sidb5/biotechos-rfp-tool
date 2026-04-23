'use client'

import { createContext, useContext } from 'react'
import type { TenantConfig } from '@shared/lib/tenant'

const TenantContext = createContext<TenantConfig | null>(null)

export function TenantProvider({
  config,
  children,
}: {
  config: TenantConfig
  children: React.ReactNode
}) {
  return (
    <TenantContext.Provider value={config}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
