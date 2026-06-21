/**
 * Seed batch DEMO terisolasi untuk menjalankan flow HITS lengkap:
 *   pengajar elect ketua → ketua isi keterangan → tabayyun auto →
 *   pengajar kirim alasan → koordinator KK putuskan udzur syar'i.
 *
 *   npm run seed-hits-demo-flow          # buat/refresh demo
 *   npm run seed-hits-demo-flow -- reset # hapus semua data demo
 *
 * Semua akun password = "demo123". Kaldik dibuat mulai minggu ini (pertemuan 1
 * = hari ini) supaya bisa langsung diisi. Idempotent.
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SLUG = 'hits-demo';
const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const DEMO_WA = {
  pengajar_ikhwan: '628990000001',
  pengajar_akhwat: '628990000002',
  koor_ikhwan: '628990000003',
  koor_akhwat: '628990000004',
};

function todayJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
function mondayOf(iso: string): string {
  const off = (weekdayOf(iso) + 6) % 7;
  return addDaysIso(iso, -off);
}

async function reset() {
  const { data: batch } = await supabaseAdmin.from('hits_batch').select('id').eq('slug', SLUG).maybeSingle();
  if (batch) {
    const { data: hls } = await supabaseAdmin.from('hits_halaqah').select('id').eq('batch_id', batch.id);
    const ids = (hls ?? []).map((h) => h.id);
    if (ids.length) {
      await supabaseAdmin.from('hits_tabayyun').delete().in('halaqah_id', ids);
      await supabaseAdmin.from('hits_keterangan_harian').delete().in('halaqah_id', ids);
      await supabaseAdmin.from('ketua_kelas').delete().in('hits_halaqah_id', ids);
      await supabaseAdmin.from('hits_halaqah_peserta').delete().in('halaqah_id', ids);
      await supabaseAdmin.from('hits_kaldik_pertemuan').delete().in('halaqah_id', ids);
    }
    await supabaseAdmin.from('hits_halaqah').delete().eq('batch_id', batch.id);
    await supabaseAdmin.from('hits_kaldik_hari').delete().eq('batch_id', batch.id);
    await supabaseAdmin.from('hits_batch').delete().eq('id', batch.id);
  }
  await supabaseAdmin.from('pengajar').delete().in('whatsapp_number', [DEMO_WA.pengajar_ikhwan, DEMO_WA.pengajar_akhwat]);
  await supabaseAdmin.from('koordinator_ketua_kelas').delete().in('whatsapp_number', [DEMO_WA.koor_ikhwan, DEMO_WA.koor_akhwat]);
  console.log('🧹 Data demo dihapus.');
}

async function ensureKelompok(gender: 'ikhwan' | 'akhwat'): Promise<string> {
  const { data: k } = await supabaseAdmin.from('kelompok_pengajar').select('id').eq('gender', gender).limit(1).maybeSingle();
  if (k) return k.id;
  const { data: ins } = await supabaseAdmin.from('kelompok_pengajar').insert({ name: `Pengajar HITS ${gender}`, gender }).select('id').single();
  return ins!.id;
}

async function main() {
  if (process.argv.slice(2).includes('reset')) { await reset(); return; }
  await reset(); // bersih dulu agar idempotent

  console.log('\n🎬 Seed DEMO flow HITS\n');
  const today = todayJakarta();
  const pass = await bcrypt.hash('demo123', 12);

  const { data: batch } = await supabaseAdmin
    .from('hits_batch')
    .insert({ name: 'HITS DEMO', slug: SLUG, start_date: today, active: true })
    .select('id').single();
  const batchId = batch!.id;

  // Kaldik: 4 pekan dari Senin minggu ini, semua hari (qoidah).
  const monday = mondayOf(today);
  const kaldik = [];
  for (let p = 1; p <= 4; p++) {
    for (let d = 0; d < 7; d++) {
      const iso = addDaysIso(monday, (p - 1) * 7 + d);
      kaldik.push({ batch_id: batchId, level: 'qoidah_nuroniyyah', tanggal: iso, hari: HARI[weekdayOf(iso)], pekan: p, is_libur: false, source: 'manual' });
    }
  }
  await supabaseAdmin.from('hits_kaldik_hari').insert(kaldik);

  const todayName = HARI[weekdayOf(today)];

  for (const gender of ['ikhwan', 'akhwat'] as const) {
    const kelompok = await ensureKelompok(gender);
    const pWa = gender === 'ikhwan' ? DEMO_WA.pengajar_ikhwan : DEMO_WA.pengajar_akhwat;
    const kWa = gender === 'ikhwan' ? DEMO_WA.koor_ikhwan : DEMO_WA.koor_akhwat;

    const { data: pengajar } = await supabaseAdmin.from('pengajar')
      .insert({ name: `Pengajar Demo ${gender}`, gender, whatsapp_number: pWa, password_hash: pass, kelompok_id: kelompok, active: true })
      .select('id').single();
    await supabaseAdmin.from('koordinator_ketua_kelas')
      .insert({ name: `Koordinator KK Demo ${gender}`, gender, whatsapp_number: kWa, password_hash: pass, active: true });

    const { data: halaqah } = await supabaseAdmin.from('hits_halaqah')
      .insert({
        batch_id: batchId, name: `DEMO ${gender.toUpperCase()}`, gender,
        level: 'qoidah_nuroniyyah', program: 'dasar',
        jadwal_hari: [todayName], jadwal_raw: `Demo ${todayName}`,
        pengajar_id: pengajar!.id, source: 'manual', active: true,
      })
      .select('id').single();

    const peserta = ['Ahmad', 'Bilal', 'Umar', 'Zaid', 'Salman'].map((nm, i) => ({
      halaqah_id: halaqah!.id, murid_id: `DEMO-${gender}-${i + 1}`, nama: `${nm} (demo)`,
      jenis_kelamin: gender === 'ikhwan' ? 'Laki-Laki' : 'Perempuan', status_peserta: 'Aktif',
      source: 'manual', active: true,
    }));
    await supabaseAdmin.from('hits_halaqah_peserta').insert(peserta);
  }

  console.log('✅ Demo siap. Pertemuan 1 = hari ini (' + today + ').');
  console.log('\nAkun (password semua: demo123):');
  console.log(`  Pengajar ikhwan : ${DEMO_WA.pengajar_ikhwan}  → /hits/pengajar (tunjuk ketua)`);
  console.log(`  Pengajar akhwat : ${DEMO_WA.pengajar_akhwat}`);
  console.log(`  Koordinator KK ikhwan : ${DEMO_WA.koor_ikhwan}  → /observasi/koordinator (tabayyun)`);
  console.log(`  Koordinator KK akhwat : ${DEMO_WA.koor_akhwat}`);
  console.log('\nFlow: pengajar tunjuk ketua → ketua login (link WA dikirim) isi keterangan KMT →');
  console.log('      tabayyun otomatis → pengajar kirim alasan → koordinator putuskan udzur.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
