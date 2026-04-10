import Link from 'next/link'

interface Props {
  searchParams: Promise<{ message?: string; type?: string }>
}

const ERROR_MESSAGES: Record<string, { title: string; body: string; action: string; href: string }> = {
  expired: {
    title: 'Link expired',
    body: 'This link has expired. Confirmation links are only valid for 24 hours. Request a new one below.',
    action: 'Back to sign in',
    href: '/login',
  },
  invalid: {
    title: 'Invalid link',
    body: 'This link is invalid or has already been used. Please request a new one.',
    action: 'Back to sign in',
    href: '/login',
  },
  recovery: {
    title: 'Password reset failed',
    body: 'The password reset link is invalid or has expired. Please request a new reset link.',
    action: 'Request new reset link',
    href: '/login?reset=1',
  },
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const params = await searchParams
  const rawMessage = params.message ?? ''
  const type = params.type ?? 'signup'

  // Map common Supabase error messages to user-friendly variants
  let config = {
    title: 'Something went wrong',
    body: rawMessage || 'We could not verify your link. It may have expired or already been used.',
    action: type === 'recovery' ? 'Request new reset link' : 'Back to sign in',
    href: type === 'recovery' ? '/login?reset=1' : '/login',
  }

  const lower = rawMessage.toLowerCase()
  if (lower.includes('expired') || lower.includes('otp_expired')) {
    config = type === 'recovery' ? ERROR_MESSAGES.recovery : ERROR_MESSAGES.expired
  } else if (lower.includes('invalid') || lower.includes('not found')) {
    config = type === 'recovery' ? ERROR_MESSAGES.recovery : ERROR_MESSAGES.invalid
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm text-center">

        {/* Icon */}
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">
          Proposal Engine
        </p>
        <h1 className="text-xl font-bold text-gray-900 mb-3">{config.title}</h1>
        <p className="text-sm text-gray-500 mb-7 leading-relaxed">{config.body}</p>

        <Link
          href={config.href}
          className="inline-block px-6 py-2.5 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors"
        >
          {config.action}
        </Link>

        <p className="mt-6 text-xs text-gray-400">
          Need help?{' '}
          <a href="mailto:support@cro-rfp-tool.com" className="text-green-600 hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </main>
  )
}
