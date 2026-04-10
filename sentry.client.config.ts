import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',

  // Capture 100% of errors; tune down in production if volume is high
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Don't log in development console
  debug: false,

  ignoreErrors: [
    // Not-found navigations are expected
    'NEXT_NOT_FOUND',
  ],
});
