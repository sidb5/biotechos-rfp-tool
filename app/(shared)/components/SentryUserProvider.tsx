'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';

export default function SentryUserProvider() {
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        Sentry.setUser({ id: user.id, email: user.email });
      } else {
        Sentry.setUser(null);
      }
    });
  }, []);

  return null;
}
