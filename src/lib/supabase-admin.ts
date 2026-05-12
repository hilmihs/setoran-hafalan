import { createClient } from '@supabase/supabase-js';

// Server-only client dengan service role key.
// JANGAN import dari komponen client. Hanya untuk:
//   - API routes / route handlers
//   - Server actions
//   - Scripts CLI (seed, set-password, cleanup)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
  );
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const AUDIO_BUCKET =
  process.env.SUPABASE_AUDIO_BUCKET ?? 'setoran-audio';
