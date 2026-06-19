// Seed data Matrix Skill Guru bulan Mei 2026 (historis) ke matrix_rekap.
// Sumber: scripts/mei2026-matrix.json (hasil ekstraksi "Matrix Guru (2).xlsx").
// Match nama → pengajar_id: normalisasi (lowercase + rapat spasi) di-scope per gender,
// plus alias manual untuk varian ejaan. Nama tanpa padanan di-skip & dicatat.
//
// Jalankan: npx tsx --env-file=.env.local scripts/seed-matrix-mei2026.ts
//
// CATATAN: bulan 2026-05 < MATRIX_LIVE_ANCHOR, jadi tidak akan di-recompute oleh
// computeMatrixForMonth — aman sebagai snapshot final.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const YEAR_MONTH = '2026-05';

type Row = {
  name: string;
  gender: string | null;
  skor_bacaan: number | null;
  skor_hafalan: number | null;
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
  skor_kehadiran_muallim: number | null;
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  skor_kedisiplinan_waktu: number | null;
  skor_komitmen_jadwal: number | null;
  skor_tanggung_jawab: number | null;
  skor_kepatuhan_sop: number | null;
  rata_rata_hard_skill: number | null;
  rata_rata_pedagogis: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
  ranking: number | null;
};

// Alias xlsx-name → nama kanonik di DB (untuk varian yang tak ketemu via normalisasi).
const ALIAS: Record<string, string> = {
  'Adam Malik Nurzuhdi Al Suyudi': 'Adam Malik',
  'Qodriyanto Mukarim Damsuki': 'Qodriyanto',
  'Zalfa Ayu Adillah': 'Zalfa Ayu',
  'Annisa Rizkya Rahmawati': 'Annisa Rizkya',
  'Aulia Khairunnisa Mahbengi': 'Aulia Khairunnisa Mahbeng',
  'Rika Ramadhona': 'Rika Ramadona',
  'Asiah Annaajiyah': 'Asiyah Annaajiyah',
  'Putri Camelia ulfah': 'Puteri Chamelia Ulfah',
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const rows: Row[] = JSON.parse(readFileSync(join(here, 'mei2026-matrix.json'), 'utf8'));
  console.log(`Memuat ${rows.length} baris dari mei2026-matrix.json`);

  const { data: pengajars, error: pErr } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, active')
    .eq('active', true);
  if (pErr) throw pErr;

  // Index: gender → normalizedName → id (catat bentrok)
  const byGenderName = new Map<string, string>(); // `${gender}|${normName}` → id
  const dup = new Set<string>();
  for (const p of pengajars ?? []) {
    const key = `${p.gender}|${norm(p.name)}`;
    if (byGenderName.has(key)) dup.add(key);
    byGenderName.set(key, p.id);
  }
  if (dup.size) console.warn(`⚠ ${dup.size} nama duplikat (normalized) di DB:`, [...dup]);

  const matched: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];

  for (const r of rows) {
    if (!r.gender) { skipped.push(`${r.name} (gender kosong)`); continue; }
    const gender = r.gender; // 'ikhwan' | 'akhwat'
    const canonical = ALIAS[r.name] ?? r.name;
    const id = byGenderName.get(`${gender}|${norm(canonical)}`);
    if (!id) { skipped.push(`${r.name} [${gender}]`); continue; }

    matched.push({
      pengajar_id: id,
      year_month: YEAR_MONTH,
      skor_bacaan: r.skor_bacaan,
      skor_hafalan: r.skor_hafalan,
      skor_tajwid: r.skor_tajwid,
      skor_kehadiran_maahir: r.skor_kehadiran_maahir,
      skor_kehadiran_tibyan: r.skor_kehadiran_tibyan,
      skor_kehadiran_muallim: r.skor_kehadiran_muallim,
      rata_rata_hard_skill: r.rata_rata_hard_skill,
      skor_metode_pengajaran: r.skor_metode_pengajaran,
      skor_kepatuhan_silabus: r.skor_kepatuhan_silabus,
      skor_manajemen_halaqah: r.skor_manajemen_halaqah,
      skor_evaluasi_penguasaan: r.skor_evaluasi_penguasaan,
      rata_rata_pedagogis: r.rata_rata_pedagogis,
      skor_kedisiplinan_waktu: r.skor_kedisiplinan_waktu,
      skor_komitmen_jadwal: r.skor_komitmen_jadwal,
      skor_tanggung_jawab: r.skor_tanggung_jawab,
      skor_kepatuhan_sop: r.skor_kepatuhan_sop,
      rata_rata_soft_skill: r.rata_rata_soft_skill,
      rata_rata_keseluruhan: r.rata_rata_keseluruhan,
      ranking: r.ranking,
      total_teguran_bulan: 0,
      total_teguran_kumulatif: 0,
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`Matched ${matched.length}/${rows.length}; skip ${skipped.length}`);
  if (skipped.length) console.log('SKIPPED:\n  ' + skipped.join('\n  '));

  // Mei 2026 = snapshot otoritatif dari xlsx. Hapus dulu semua baris bulan ini
  // (mis. sisa hasil computeMatrixForMonth lama yang berisi nol) sebelum insert,
  // supaya pengajar di luar xlsx tampil "—", bukan skor nol menyesatkan.
  const { error: delErr } = await supabaseAdmin
    .from('matrix_rekap')
    .delete()
    .eq('year_month', YEAR_MONTH);
  if (delErr) throw delErr;

  if (matched.length) {
    const { error } = await supabaseAdmin
      .from('matrix_rekap')
      .upsert(matched, { onConflict: 'pengajar_id,year_month' });
    if (error) throw error;
    console.log(`✓ Hapus baris lama + insert ${matched.length} baris matrix_rekap (${YEAR_MONTH})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
