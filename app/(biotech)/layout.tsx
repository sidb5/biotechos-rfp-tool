import type { Metadata } from 'next';
import BiotechNav from '@biotech/components/BiotechNav';
import { getTenantConfig } from '@shared/lib/get-tenant';

export async function generateMetadata(): Promise<Metadata> {
  const config = getTenantConfig();
  return {
    title: `${config.platformName} — ${config.counterpartyLabel} Portal`,
    description: `Source ${config.counterpartyLabel}s, manage RFPs, and track your research programs.`,
  };
}

export default function BiotechLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <BiotechNav />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
