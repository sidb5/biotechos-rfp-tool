import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

/**
 * /r/export?source=pdf&token=<share_token>
 *
 * Mechanic A redirect tracker.
 * Tracks click-throughs from PDF/Word footers then redirects to /signup.
 * The `token` param optionally ties the click to a specific proposal/CRO.
 */

interface Props {
  searchParams: Promise<{ source?: string; token?: string }>
}

export default async function ExportRedirectPage({ searchParams }: Props) {
  const params = await searchParams
  const source = params.source ?? 'pdf'
  const token = params.token ?? null

  // Record attribution
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (token) {
    // Find proposal by share_token
    const { data: proposal } = await service
      .from('proposals')
      .select('id, cro_id')
      .eq('share_token', token)
      .single()

    if (proposal) {
      await service.from('referral_sources').insert({
        source_type: source === 'pdf' ? 'pdf_footer' : 'word_footer',
        proposal_id: proposal.id,
        cro_id: proposal.cro_id ?? null,
        share_token: token,
      })
    }
  }

  redirect('/signup')
}
