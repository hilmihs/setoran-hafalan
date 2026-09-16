// Uji integrasi CMS tilawah. Sadar lingkungan: aman dijalankan terhadap staging
// maupun produksi. Jalankan: npm run test-tilawah
//
// BAWAANNYA TIDAK MENULIS APA PUN. Skrip menyusun payload lengkap memakai master
// data sungguhan dari lingkungan yang sedang diarahkan, lalu menampilkannya —
// tanpa satu pun POST ke sumber daya CMS.
//
// Untuk benar-benar menulis — SELALU ke staging:
//   KIRIM_NYATA=1 npm run test-tilawah
//
// Membaca memakai TILAWAH_* (boleh diarahkan ke produksi). MENULIS selalu memakai
// STAGING_BASE_URL / STAGING_EMAIL / STAGING_PASSWORD. Pemisahan ini struktural:
// kredensial produksi tidak pernah dipakai saat menulis, sehingga tidak ada
// bendera maupun salah ketik yang dapat mengarahkan tulisan ke produksi.
//
// Alasannya bukan sekadar kehati-hatian: `DELETE /api/users/{id}` membalas 302
// tanpa menghapus apa pun, sehingga akun murid yang salah masuk ke batch nyata
// menetap di sana selamanya.
//
// Menulis ke produksi adalah keputusan operasional, dan jalannya lewat aplikasi:
// koordinator menyetujui usulan, superadmin menyalakan `ks_periode.kirim_nyata`.
// Bukan lewat skrip uji.
//
// Data dummy maahir dibuat di DATABASE_URL lokal dan dihapus di akhir.
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ambilBatches,
  ambilDays,
  ambilLevels,
  ambilPrograms,
  ambilSessions,
  cariGuru,
  tilawahTerkonfigurasi,
  ujiKoneksi,
} from '@/lib/tilawah/client';
import { hariTidakKonsisten, usulkanHari, usulkanLevel, usulkanSesi } from '@/lib/tilawah/map';
import { antrekanPengiriman, prosesOutbox } from '@/lib/tilawah/push';
import { siapkanSlot, SLOT_BAWAAN } from '@/lib/ketersediaan-periode';
import type { KsPeriode, KsSlot } from '@/types/db';

const dbUrl = process.env.DATABASE_URL ?? '';
const MINTA_KIRIM = process.env.KIRIM_NYATA === '1';
const BATCH_ENV = process.env.TILAWAH_BATCH ? Number(process.env.TILAWAH_BATCH) : null;

/** Rapikan URL yang salah tulis, mis. skema tertulis dua kali. */
function rapikanUrl(u: string): string {
  return u.trim().replace(/^(https?:\/\/)+/i, 'https://').replace(/\/+$/, '');
}

if (!/@(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(dbUrl)) {
  console.error('DATABASE_URL bukan host lokal. Skrip ini membuat data dummy dan menolak jalan di luar dev.');
  process.exit(1);
}

// ── Pemilihan lingkungan ───────────────────────────────────────────────────
// Membaca memakai TILAWAH_* (boleh produksi). MENULIS selalu memakai STAGING_*.
// Aturan ini struktural, bukan sekadar penjaga: variabel produksi tidak pernah
// dipakai saat menulis, jadi tidak ada bendera atau salah ketik yang bisa
// mengarahkan tulisan ke produksi.
if (MINTA_KIRIM) {
  const sBase = rapikanUrl(process.env.STAGING_BASE_URL ?? '');
  const sEmail = process.env.STAGING_EMAIL ?? '';
  const sPass = process.env.STAGING_PASSWORD ?? '';
  if (!sBase || !sEmail || !sPass) {
    console.error(
      'Menulis menuntut kredensial staging: STAGING_BASE_URL / STAGING_EMAIL / STAGING_PASSWORD.\n' +
        '  Percobaan yang menulis dilakukan di staging; produksi hanya dibaca.'
    );
    process.exit(1);
  }
  if (!/staging/i.test(sBase)) {
    console.error(`STAGING_BASE_URL tidak tampak seperti staging: ${sBase}. Menolak menulis.`);
    process.exit(1);
  }
  // Klien membaca env saat dipanggil, jadi menimpanya di sini sudah cukup.
  process.env.TILAWAH_BASE_URL = sBase;
  process.env.TILAWAH_EMAIL = sEmail;
  process.env.TILAWAH_PASSWORD = sPass;
} else {
  process.env.TILAWAH_BASE_URL = rapikanUrl(process.env.TILAWAH_BASE_URL ?? '');
}

const base = process.env.TILAWAH_BASE_URL ?? '';
const PRODUKSI = !/staging/i.test(base);
const KIRIM = MINTA_KIRIM;

if (!tilawahTerkonfigurasi()) {
  console.error('TILAWAH_BASE_URL / TILAWAH_EMAIL / TILAWAH_PASSWORD belum diset di .env.local.');
  process.exit(1);
}

let gagal = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`);
    gagal++;
  } else console.log(`ok   ${label}`);
}
function ok(cond: boolean, label: string) {
  if (cond) console.log(`ok   ${label}`);
  else {
    console.error(`FAIL ${label}`);
    gagal++;
  }
}

const TANDA = 'UJI-KETERSEDIAAN';
let periodeId: string | null = null;
const pengajarDibuat: string[] = [];
let kelompokDibuat: string | null = null;

async function bersihkan() {
  if (periodeId) await supabaseAdmin.from('ks_periode').delete().eq('id', periodeId);
  for (const id of pengajarDibuat) await supabaseAdmin.from('pengajar').delete().eq('id', id);
  if (kelompokDibuat) await supabaseAdmin.from('kelompok_pengajar').delete().eq('id', kelompokDibuat);
  if (!periodeId) return;
  const { data } = await supabaseAdmin.from('ks_periode').select('id').eq('id', periodeId);
  if ((data ?? []).length > 0) {
    console.error('FAIL data dummy maahir gagal dibersihkan');
    gagal++;
  } else console.log('ok   data dummy maahir dibersihkan');
}

async function main() {
  console.log(`# lingkungan: ${PRODUKSI ? 'PRODUKSI' : 'staging'} — ${base}`);
  console.log(`# mode: ${KIRIM ? 'PENGIRIMAN NYATA' : 'kirim-percobaan (tidak menulis apa pun)'}\n`);

  const koneksi = await ujiKoneksi();
  ok(koneksi.programs > 0, `terhubung, ${koneksi.programs} program terbaca`);

  const [programs, days, sessions, levels] = await Promise.all([
    ambilPrograms(),
    ambilDays(),
    ambilSessions(),
    ambilLevels(),
  ]);
  console.log(`     ${days.length} hari · ${sessions.length} sesi · ${levels.length} level`);

  const pincang = days.filter(hariTidakKonsisten);
  console.log(
    `\n# baris hari dengan int_days tidak sesuai namanya (${pincang.length}):\n` +
      pincang.map((d) => `     #${d.id} "${d.name}" ${JSON.stringify(d.int_days)}`).join('\n')
  );

  // ── Pilih program & batch HITS ───────────────────────────────────────────
  const programHits = programs.find((p) => /hits[- ]?regu?l|hits[- ]?reguler/i.test(p.slug + p.name));
  ok(Boolean(programHits), `program HITS Reguler ditemukan (#${programHits?.id})`);
  if (!programHits) return;

  const batches = await ambilBatches(programHits.id);
  console.log(`\n# batch program #${programHits.id} "${programHits.name}":`);
  for (const b of batches) {
    console.log(
      `     #${String(b.id).padStart(3)} ${String(b.name).padEnd(24)} ${String(b.start_date).slice(0, 10)} → ${String(b.end_date).slice(0, 10)}  halaqah=${b.halaqohs_count ?? '?'} murid=${b.murids_count ?? '?'}`
    );
  }
  const batchId = BATCH_ENV ?? batches.sort((a, b) => b.id - a.id)[0]?.id;
  ok(Boolean(batchId), `batch tujuan: #${batchId}`);
  if (!batchId) return;

  // ── Periode dummy + 27 slot bawaan di maahir lokal ───────────────────────
  const { data: periodeRow, error: ePeriode } = await supabaseAdmin
    .from('ks_periode')
    .insert({
      nama: TANDA,
      mulai: '2026-09-01',
      selesai: '2026-10-31',
      kapasitas_halaqah: 2,
      ambang_bentuk: 2,
      ambang_bawah: 2,
      minimal_slot: 1,
      // Sengaja kecil: mekanismenya yang diuji di sini, sedangkan penanggalan
      // 22 pertemuan sudah diuji terhadap data produksi di test-ketersediaan.
      jumlah_pertemuan_dasar: 4,
      jumlah_pertemuan_lanjutan: 4,
      tilawah_program_id: programHits.id,
      tilawah_batch_id: batchId,
      kirim_nyata: KIRIM,
    })
    .select('*')
    .single();
  if (ePeriode || !periodeRow) {
    throw new Error(`gagal membuat periode dummy di DB lokal: ${ePeriode?.message ?? 'tanpa pesan'}`);
  }
  periodeId = periodeRow.id as string;
  const periode = periodeRow as KsPeriode;

  const { baris } = siapkanSlot(periode.id, SLOT_BAWAAN);
  for (const b of baris) await supabaseAdmin.from('ks_slot').insert(b);
  const { data: slotRows } = await supabaseAdmin.from('ks_slot').select('*').eq('periode_id', periode.id);
  const slots = (slotRows ?? []) as KsSlot[];
  eq(slots.length, 27, '27 slot MASTER_SLOT tersedia');

  // ── Laporan pemetaan seluruh slot ────────────────────────────────────────
  console.log('\n# usulan pemetaan 27 slot ke master CMS');
  console.log('  slot                                        day  sesi  keyakinan');
  let pasti = 0;
  let ragu = 0;
  let kosong = 0;
  const petaSlot: { slot: KsSlot; day: number | null; sesi: number | null }[] = [];

  for (const s of slots) {
    const uh = usulkanHari(s, days);
    const us = usulkanSesi(s, sessions);
    const yakin =
      uh.keyakinan === 'pasti' && us.keyakinan === 'pasti'
        ? 'pasti'
        : uh.day_id && us.session_id
          ? 'ragu'
          : 'TIDAK ADA';
    if (yakin === 'pasti') pasti++;
    else if (yakin === 'ragu') ragu++;
    else kosong++;
    petaSlot.push({ slot: s, day: uh.day_id, sesi: us.session_id });
    const tanda = s.kelompok === 'ikhwan' ? 'I' : 'A';
    console.log(
      `  ${tanda} ${s.mode === 'offline' ? 'off' : 'on '} ${s.label.padEnd(36)} ${String(uh.day_id ?? '—').padStart(3)}  ${String(us.session_id ?? '—').padStart(4)}  ${yakin}` +
        (yakin === 'pasti' ? '' : `\n        hari: ${uh.alasan}\n        sesi: ${us.alasan}`)
    );
  }
  console.log(`\n     ${pasti} pasti · ${ragu} ragu · ${kosong} tanpa padanan`);
  ok(kosong === 0, 'setiap slot punya padanan day_id + session_id');

  const uLevelDasar = usulkanLevel('HITS Dasar', levels);
  const uLevelLanjutan = usulkanLevel('HITS Lanjutan', levels);
  console.log(
    `\n# level: HITS Dasar → ${uLevelDasar.level_id ?? '—'} (${uLevelDasar.keyakinan}) · ` +
      `HITS Lanjutan → ${uLevelLanjutan.level_id ?? '—'} (${uLevelLanjutan.keyakinan})`
  );
  ok(Boolean(uLevelDasar.level_id && uLevelLanjutan.level_id), 'kedua level terpetakan');

  // Simpan pemetaan (di basis data LOKAL, bukan di CMS).
  for (const p of petaSlot) {
    if (!p.day || !p.sesi) continue;
    await supabaseAdmin.from('ks_tilawah_slot_map').insert({
      periode_id: periode.id,
      tilawah_batch_id: batchId,
      slot_id: p.slot.id,
      day_id: p.day,
      session_id: p.sesi,
      usulan_otomatis: true,
    });
  }
  await supabaseAdmin.from('ks_tilawah_level_map').insert({
    periode_id: periode.id,
    tilawah_batch_id: batchId,
    level_nama: 'HITS Dasar',
    level_id: uLevelDasar.level_id!,
  });

  // ── Pengajar & pendaftar dummy ───────────────────────────────────────────
  const guru = await cariGuru(batchId, '');
  const guruBernomor = guru.find((g) => (g.phone ?? '').replace(/\D/g, '').length >= 9);
  ok(Boolean(guruBernomor), `guru bernomor ditemukan di batch (#${guruBernomor?.id} ${guruBernomor?.name})`);
  if (!guruBernomor) return;

  const { data: kel } = await supabaseAdmin
    .from('kelompok_pengajar')
    .insert({ name: `${TANDA} Kelompok`, gender: 'ikhwan' })
    .select('id')
    .single();
  kelompokDibuat = kel!.id as string;

  const nomorGuru = (guruBernomor.phone ?? '').replace(/\D/g, '').replace(/^62/, '');
  const { data: pg } = await supabaseAdmin
    .from('pengajar')
    .insert({
      name: guruBernomor.name,
      gender: 'ikhwan',
      whatsapp_number: nomorGuru,
      password_hash: 'x',
      kelompok_id: kelompokDibuat,
      active: true,
    })
    .select('id')
    .single();
  pengajarDibuat.push(pg!.id as string);

  const slotUji = slots.find((s) => s.kelompok === 'ikhwan' && s.label.startsWith('Senin & Rabu 06:00'))!;
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .insert({
      periode_id: periode.id,
      pengajar_id: pg!.id,
      mode: 'online',
      komitmen: true,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  await supabaseAdmin
    .from('ks_ketersediaan')
    .insert({ pengisian_id: pengisian!.id, slot_id: slotUji.id, status: 'terverifikasi' });

  const pendaftarIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { data: pd } = await supabaseAdmin
      .from('ks_pendaftar')
      .insert({
        periode_id: periode.id,
        sumber_row_key: `${TANDA}-${i}`,
        nama: `${TANDA} Murid ${i}`,
        wa: `08155500000${i}`,
        wa_normal: `8155500000${i}`,
        tanggal_lahir: '2000-01-01',
        umur: 26,
        pita_umur: '26-35',
        gender: 'ikhwan',
        level_pilihan: 'HITS Dasar',
        slot_label_raw: slotUji.label,
        slot_id: slotUji.id,
        didaftar_pada: new Date().toISOString(),
        status: 'valid',
      })
      .select('id')
      .single();
    pendaftarIds.push(pd!.id as string);
  }

  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .insert({
      periode_id: periode.id,
      slot_id: slotUji.id,
      pengajar_id: pg!.id,
      level: 'HITS Dasar',
      pita_umur: '26-35',
      putaran: 1,
      status: 'dikonfirmasi',
      nama_halaqah: `${TANDA} — hapus manual`,
      tanggal_mulai: '2026-09-08',
    })
    .select('id')
    .single();
  for (const pid of pendaftarIds) {
    await supabaseAdmin.from('ks_usulan_peserta').insert({ usulan_id: usulan!.id, pendaftar_id: pid });
    await supabaseAdmin.from('ks_pendaftar').update({ status: 'dialokasikan' }).eq('id', pid);
  }
  await antrekanPengiriman(usulan!.id as string);

  // ── Susun payload ────────────────────────────────────────────────────────
  console.log(`\n# proses outbox (${KIRIM ? 'PENGIRIMAN NYATA' : 'kirim-percobaan'})`);
  const hasil = await prosesOutbox(periode);
  console.log(`     diproses=${hasil.diproses} terkirim=${hasil.terkirim} gagal=${hasil.gagal}`);
  for (const p of hasil.pesan) console.log(`     · ${p}`);

  const { data: sesudah } = await supabaseAdmin
    .from('ks_outbox')
    .select('aksi, status, payload')
    .eq('usulan_id', usulan!.id)
    .order('urutan', { ascending: true });
  const rows = (sesudah ?? []) as { aksi: string; status: string; payload: Record<string, unknown> }[];

  const ph = rows.find((r) => r.aksi === 'buat_halaqah')?.payload ?? {};
  console.log('\n     payload halaqah yang AKAN dikirim:');
  console.log('     ' + JSON.stringify(ph, null, 1).split('\n').join('\n     '));
  eq(ph.batch_id, batchId, 'payload memakai batch tujuan');
  eq(ph.day_id, petaSlot.find((p) => p.slot.id === slotUji.id)?.day, 'day_id dari pemetaan lingkungan ini');
  eq(ph.session_id, petaSlot.find((p) => p.slot.id === slotUji.id)?.sesi, 'session_id dari pemetaan lingkungan ini');
  eq(ph.level_id, uLevelDasar.level_id, 'level_id dari pemetaan');
  eq(ph.user_id, guruBernomor.id, 'guru tercocokkan lewat nomor telepon');

  const pp = rows.find((r) => r.aksi === 'buat_pertemuan')?.payload ?? {};
  console.log('\n     payload pertemuan pertama:');
  console.log('     ' + JSON.stringify(pp, null, 1).split('\n').join('\n     '));

  const pe = rows.find((r) => r.aksi === 'enrol')?.payload ?? {};
  console.log('\n     payload enrol yang AKAN dikirim:');
  console.log('     ' + JSON.stringify(pe, null, 1).split('\n').join('\n     '));

  if (!KIRIM) {
    ok(rows.every((r) => r.status === 'antre'), 'tidak ada baris yang terkirim — nol tulis ke CMS');
    console.log(
      PRODUKSI
        ? '\n     Produksi hanya dibaca. Pengiriman nyata jalannya lewat aplikasi:\n' +
            '     koordinator menyetujui usulan, superadmin menyalakan kirim_nyata.'
        : '\n     Untuk benar-benar mengirim ke staging: KIRIM_NYATA=1 npm run test-tilawah'
    );
  } else {
    ok(hasil.gagal === 0, `pengiriman tanpa kegagalan (${hasil.terkirim} langkah)`);
  }
}

main()
  .catch((e) => {
    console.error('\nGALAT:', e);
    gagal++;
  })
  .finally(async () => {
    await bersihkan();
    console.log(gagal === 0 ? '\nSEMUA LULUS' : `\n${gagal} GAGAL`);
    process.exit(gagal === 0 ? 0 : 1);
  });
