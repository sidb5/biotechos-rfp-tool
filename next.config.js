/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js bundling these Node.js packages — load them from node_modules at runtime.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'puppeteer-core', '@sparticuz/chromium', 'adm-zip'],
  },
};

// Only wrap with Sentry if we have auth credentials — avoids build failures on first deploy
const hasSentryCredentials = process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT;

if (hasSentryCredentials) {
  const { withSentryConfig } = require('@sentry/nextjs');
  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    widenClientFileUpload: true,
    webpack: {
      treeshake: { removeDebugLogging: true },
      autoInstrumentServerFunctions: false,
    },
  });
} else {
  module.exports = nextConfig;
}
