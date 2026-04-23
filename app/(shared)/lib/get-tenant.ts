import { headers } from 'next/headers'
import { TENANT_MAP, TENANT_CONFIG } from './tenant'
import type { Tenant, TenantConfig } from './tenant'

/**
 * Server-only: resolves the current tenant from the Host request header.
 * Works in Server Components, generateMetadata, and Route Handlers.
 * Falls back to 'CRO' when the host is unrecognised (local dev, previews, etc).
 */
export function getTenant(): Tenant {
  const h = headers()
  const host = (h.get('host') ?? 'localhost:3000').replace(/^www\./, '')
  return TENANT_MAP[host] ?? 'CRO'
}

export function getTenantConfig(): TenantConfig {
  return TENANT_CONFIG[getTenant()]
}
