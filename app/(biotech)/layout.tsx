import type { Metadata } from 'next';
import BiotechNav from '@biotech/components/BiotechNav';

export const metadata: Metadata = {
  title: 'BiotechOS — Sponsor Portal',
  description: 'Source CROs, manage RFPs, and track your research programs.',
};

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
