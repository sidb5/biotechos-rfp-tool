import type { Metadata } from 'next';
import './(shared)/styles/globals.css';
import SentryUserProvider from '@shared/components/SentryUserProvider';

export const metadata: Metadata = {
  title: 'CRO Proposal Engine',
  description: 'Reply to any client request in hours, not days. Turn emails, PDFs, and RFPs into professional proposals.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <SentryUserProvider />
        {children}
      </body>
    </html>
  );
}
