import { type NextRequest } from 'next/server';
import { updateSession } from '@shared/lib/supabase-middleware';
import { TENANT_MAP } from '@shared/lib/tenant';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // Stamp the resolved tenant on the response so CDN / edge logs can
  // route or inspect by tenant without re-computing the host mapping.
  const host = (request.headers.get('host') ?? 'localhost:3000').replace(/^www\./, '');
  const tenant = TENANT_MAP[host] ?? 'CRO';
  response.headers.set('x-tenant', tenant);

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
