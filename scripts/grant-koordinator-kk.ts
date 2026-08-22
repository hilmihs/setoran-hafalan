/**
 * Grant role `koordinator_ketua_kelas` ke sejumlah orang dengan REUSE akun
 * existing (pengajar / ketua_kelas / koordinator / musyrif). WA + password_hash
 * diambil dari akun lama → mereka login pakai password yang sama, role KK
 * (observasi, indisipliner/tabayyun, shakwa) muncul sebagai akses tambahan.
 *
 * Jalankan di environment yang punya kredensial PROD:
 *   Dry-run (default, tidak menulis):
 *     npx tsx --env-file=.env.local scripts/grant-koordinator-kk.ts
 *   Commit (menulis ke DB):
 *     npx tsx --env-file=.env.local scripts/grant-koordinator-kk.ts --commit
 *
 * Idempotent: kalau WA sudah ada di koordinator_ketua_kelas → dilewati.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const COMMIT = process.argv.includes('--commit');

// Nama target (case-insensitive, semua kata harus muncul di nama akun).
const TARGETS = [
  'ahmad syukri',
  'nurlayla',
  'salma rifdatul husna',
  'talida jihan nabila',
  'umi hidayati',
  'nadiyah alamanda',
  'adam malik',
];

// Urut prioritas sumber akun (yang atas dipakai kalau match di banyak tabel sekaligus).
const SOURCE_TABLES = ['pengajar', 'ketua_kelas', 'koordinator', 'musyrif'] as const;

type Acct = { table: string; name: string; gender: string; whatsapp_number: string; password_hash: string };

function normName(s: string) {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function loadSource(): Promise<Acct[]> {
  const out: Acct[] = [];
  for (const t of SOURCE_TABLES) {
    const { data, error } = await supabaseAdmin
      .from(t)
      .select('name, gender, whatsapp_number, password_hash, active');
    if (error) {
      console.log(`⚠️  gagal baca ${t}: ${error.message}`);
      continue;
    }
    for (const r of data ?? []) {
      if (!r.whatsapp_number || !r.password_hash) continue;
      if (r.active === false) continue;
      out.push({ table: t, name: r.name, gender: r.gender, whatsapp_number: r.whatsapp_number, password_hash: r.password_hash });
    }
  }
  return out;
}

async function main() {
  console.log(`Mode: ${COMMIT ? 'COMMIT (menulis DB)' : 'DRY-RUN (tidak menulis) — pakai --commit untuk eksekusi'}\n`);

  const accounts = await loadSource();
  const { data: existingKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('name, whatsapp_number');
  const existingWa = new Set((existingKK ?? []).map((r: any) => r.whatsapp_number));

  const toInsert: { name: string; gender: string; whatsapp_number: string; password_hash: string }[] = [];
  const problems: string[] = [];

  for (const target of TARGETS) {
    const words = normName(target).split(' ');
    const matches = accounts.filter((a) => {
      const n = normName(a.name);
      return words.every((w) => n.includes(w));
    });

    // Dedup per (whatsapp_number) — satu orang bisa muncul di banyak tabel dgn WA sama.
    const byWa = new Map<string, Acct>();
    for (const m of matches) if (!byWa.has(m.whatsapp_number)) byWa.set(m.whatsapp_number, m);
    const distinct = [...byWa.values()];

    if (distinct.length === 0) {
      problems.push(`❌ "${target}": TIDAK ada akun cocok. Skip.`);
      continue;
    }
    if (distinct.length > 1) {
      const list = distinct.map((d) => `${d.name} [${d.table}] ${d.whatsapp_number}`).join('  |  ');
      problems.push(`⚠️  "${target}": AMBIGU (${distinct.length} WA berbeda) → ${list}. Skip — resolusi manual.`);
      continue;
    }

    const acct = distinct[0];
    if (existingWa.has(acct.whatsapp_number)) {
      console.log(`= "${target}" → ${acct.name} (${acct.whatsapp_number}) sudah koordinator_ketua_kelas. Skip.`);
      continue;
    }
    console.log(`+ "${target}" → match: ${acct.name} [${acct.table}] ${acct.gender} ${acct.whatsapp_number}`);
    toInsert.push({ name: acct.name, gender: acct.gender, whatsapp_number: acct.whatsapp_number, password_hash: acct.password_hash });
  }

  if (problems.length) {
    console.log('\n--- Perlu perhatian ---');
    for (const p of problems) console.log(p);
  }

  console.log(`\nAkan di-insert: ${toInsert.length} baris.`);
  if (!COMMIT) {
    console.log('DRY-RUN selesai. Cek daftar di atas, lalu jalankan ulang dengan --commit.');
    return;
  }
  if (toInsert.length === 0) {
    console.log('Tidak ada yang di-insert.');
    return;
  }
  const { error } = await supabaseAdmin.from('koordinator_ketua_kelas').insert(toInsert);
  if (error) {
    console.log(`✗ Insert gagal: ${error.message}`);
    process.exit(1);
  }
  console.log(`✅ ${toInsert.length} orang diberi akses koordinator_ketua_kelas (observasi + indisipliner + shakwa).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
