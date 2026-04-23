import type { Metadata } from 'next';
import { Suspense } from 'react';
import './(shared)/styles/globals.css';
import SentryUserProvider from '@shared/components/SentryUserProvider';
import NavigationProgress from '@shared/components/NavigationProgress';
import { TenantProvider } from '@shared/components/TenantProvider';
import { getTenantConfig } from '@shared/lib/get-tenant';

export async function generateMetadata(): Promise<Metadata> {
  const config = getTenantConfig();
  return {
    title: config.platformName,
    description: config.appSide === 'sell'
      ? 'Reply to any client request in hours, not days. Turn emails, PDFs, and RFPs into professional proposals.'
      : 'Source CROs, manage RFPs, and track your research programs.',
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantConfig = getTenantConfig();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <TenantProvider config={tenantConfig}>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <SentryUserProvider />
          {children}
        </TenantProvider>
      </body>
    </html>
  );
}
