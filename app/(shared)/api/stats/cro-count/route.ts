import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/stats/cro-count
 * Returns: { count: number }
 *
 * Public endpoint — returns total number of CRO profiles.
 * Used for social proof on signup / pricing pages (Mechanic C).
 * No auth required. Rounded down to nearest 10 for aesthetics.
 */
export async function GET() {
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { count } = await service
    .from('cro_profiles')
    .select('id', { count: 'exact', head: true })

  const rounded = Math.max(1, Math.floor((count ?? 1) / 10) * 10)

  return NextResponse.json({ count: rounded }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
