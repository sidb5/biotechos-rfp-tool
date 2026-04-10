import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BiotechOS — Sponsor Portal',
  description: 'Source CROs, manage RFPs, and track your research programs.',
};

export default function BiotechLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
