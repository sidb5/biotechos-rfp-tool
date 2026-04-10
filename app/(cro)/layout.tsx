import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CRO Proposal Engine',
  description: 'Reply to any client request in hours, not days.',
};

export default function CROLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
