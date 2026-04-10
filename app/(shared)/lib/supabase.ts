import { createBrowserClient } from '@supabase/ssr';

// Use createBrowserClient (not createClient) so the session is stored in
// cookies instead of localStorage — this makes it readable by the server
// middleware and server components via @supabase/ssr.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
