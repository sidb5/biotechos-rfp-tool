import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

interface Props {
  params: Promise<{ token: string }>
}

export default async function ProposalLandingPage({ params }: Props) {
  const { token } = await params

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up the proposal by share_token to find which CRO sent it
  const { data: proposal } = await service
    .from('proposals')
    .select('id, cro_id')
    .eq('share_token', token)
    .eq('share_enabled', true)
    .single()

  let croName: string | null = null
  if (proposal?.cro_id) {
    const { data: profile } = await service
      .from('cro_profiles')
      .select('company_name')
      .eq('id', proposal.cro_id)
      .single()
    croName = profile?.company_name ?? null
  }

  // Track this attribution click
  if (proposal?.id) {
    const ipHash = '' // we don't collect IPs — just record the event
    await service.from('referral_sources').insert({
      source_type: 'pdf_footer',
      proposal_id: proposal.id,
      cro_id: proposal.cro_id ?? null,
      share_token: token,
      ip_hash: ipHash,
    }).then(() => {/* fire and forget */})
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">

        {/* Logo mark */}
        <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">Proposal Engine</p>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {croName
            ? `This proposal was created by ${croName}`
            : 'This proposal was created with Proposal Engine'}
        </h1>

        <p className="text-gray-600 mb-2">
          Proposal Engine helps preclinical CROs respond to client requests
          in hours — not days. No more pulling scientists into sales.
        </p>

        {croName && (
          <p className="text-sm text-gray-500 mb-8">
            {croName} used Proposal Engine to build this proposal for you.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <Link
            href={`/signup${croName ? `?from_proposal=1` : ''}`}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors shadow-sm"
          >
            See how it works →
          </Link>
          <Link
            href="/pricing"
            className="px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            View pricing
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Free to start
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            No credit card required
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            First quote in &lt;1 hour
          </span>
        </div>
      </div>
    </main>
  )
}
