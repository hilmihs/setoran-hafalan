import { createBrowserClient } from '@supabase/ssr';

// Client untuk browser. Pakai anon key, RLS akan jadi gatekeeper.
// Untuk MVP ini, akses peserta sepenuhnya via server actions, jadi client ini
// dipakai minimal — hanya untuk download audio dari signed URL.

export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
