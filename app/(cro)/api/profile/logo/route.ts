import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'cro-logos';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

function createAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* server component */ }
        },
      },
    }
  );
}

// Service-role client for storage operations (bypasses RLS for bucket management)
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const supabase = createAuthClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('cro_profiles').select('id').eq('user_id', user.id).single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('logo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Upload a PNG, JPG, or SVG.' },
      { status: 400 }
    );
  }

  // Validate size
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is 2 MB (uploaded: ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
      { status: 400 }
    );
  }

  const ext = file.type === 'image/svg+xml' ? 'svg'
    : file.type === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${user.id}/logo.${ext}`;

  // Ensure bucket exists (idempotent)
  await service.storage.createBucket(BUCKET, { public: true }).catch(() => {/* already exists */});

  // Upload (upsert — replaces existing logo)
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Get public URL
  const { data: { publicUrl } } = service.storage.from(BUCKET).getPublicUrl(storagePath);

  // Cache-bust so the browser re-fetches after an update
  const logoUrl = `${publicUrl}?t=${Date.now()}`;

  // Save to profile
  const { error: dbError } = await supabase
    .from('cro_profiles')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ logo_url: logoUrl });
}

export async function DELETE() {
  const supabase = createAuthClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('cro_profiles').select('id, logo_url').eq('user_id', user.id).single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Remove all logo files for this user (any extension)
  for (const ext of ['png', 'jpg', 'svg']) {
    await service.storage.from(BUCKET).remove([`${user.id}/logo.${ext}`]);
  }

  // Clear logo_url in DB
  await supabase
    .from('cro_profiles')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  return NextResponse.json({ ok: true });
}
