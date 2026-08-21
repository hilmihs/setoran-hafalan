import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyBearer, recordUsage } from '@/lib/api-public/auth';

export const runtime = 'nodejs';

// CATATAN: nama-nama field sumber (id/nama/gender/...) di bawah ini bersifat
// PROVISIONAL — menunggu spesifikasi API sinkron user yang sebenarnya. Pemetaan
// dari payload sumber ke kolom mirror DILAKUKAN DI SINI, jadi kalau field sumber
// berbeda (mis. "name" bukan "nama"), cukup ubah pemetaan di fungsi ini.

type Mirror = 'eval_batch' | 'eval_pengajar' | 'eval_halaqah' | 'eval_peserta';

interface Row {
  id: unknown;
  nama?: unknown;
  [k: string]: unknown;
}

// Allowlist kolom per tabel mirror. Hanya kolom-kolom ini yang boleh disalin dari
// payload sumber; sisanya diabaikan supaya caller tidak bisa menyetel kolom lain
// (mis. flag internal) secara verbatim. `synced_at` selalu diset server.
const COLS: Record<Mirror, readonly string[]> = {
  eval_batch: ['id', 'nama', 'aktif'],
  eval_pengajar: ['id', 'nama', 'gender', 'whatsapp'],
  eval_halaqah: [
    'id',
    'nama',
    'gender',
    'mustawa',
    'level',
    'pengajar_id',
    'batch_id',
    'ambang_ujian',
  ],
  eval_peserta: ['id', 'nama', 'gender', 'halaqah_id', 'is_ketua', 'aktif', 'urutan'],
};

/**
 * Terima hanya baris yang punya `id` + `nama` valid, pilih kolom sesuai allowlist
 * tabel, lalu tempel `synced_at` (diset server).
 */
function prepare(rows: unknown, cols: readonly string[]): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  const now = new Date().toISOString();
  const out: Record<string, unknown>[] = [];
  for (const r of rows as Row[]) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.id !== 'string' || !r.id) continue;
    if (typeof r.nama !== 'string' || !r.nama) continue;
    const picked = Object.fromEntries(
      cols.filter((c) => c in r).map((c) => [c, (r as Record<string, unknown>)[c]])
    );
    out.push({ ...picked, synced_at: now });
  }
  return out;
}

async function upsertMirror(table: Mirror, rows: unknown): Promise<number> {
  const prepared = prepare(rows, COLS[table]);
  if (prepared.length === 0) return 0;
  const { error } = await supabaseAdmin.from(table).upsert(prepared, { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
  return prepared.length;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyBearer(req.headers.get('authorization'));
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    recordUsage(auth.client.id);

    const body = await req.json();
    const { batch, pengajar, halaqah, peserta } = body as {
      batch?: unknown;
      pengajar?: unknown;
      halaqah?: unknown;
      peserta?: unknown;
    };

    // Urutan penting: pengajar & batch dulu (halaqah mereferensikannya),
    // lalu halaqah, lalu peserta.
    const counts = {
      batch: await upsertMirror('eval_batch', batch),
      pengajar: await upsertMirror('eval_pengajar', pengajar),
      halaqah: await upsertMirror('eval_halaqah', halaqah),
      peserta: await upsertMirror('eval_peserta', peserta),
    };

    return NextResponse.json({ ok: true, counts });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
