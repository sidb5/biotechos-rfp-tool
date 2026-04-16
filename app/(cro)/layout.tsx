'use client';

import { CRONavShell } from '@shared/components/AppShell';

export default function CROLayout({ children }: { children: React.ReactNode }) {
  return <CRONavShell>{children}</CRONavShell>;
}
