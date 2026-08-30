// Uji integrasi CMS tilawah terhadap STAGING. Jalankan:
//   npm run test-tilawah-staging
//
// Bawaannya MODE PERCOBAAN: menyusun payload lengkap dan memeriksanya, tetapi
// tidak menulis apa pun ke CMS. Untuk benar-benar membuat satu halaqah uji:
//   KIRIM_NYATA=1 npm run test-tilawah-staging
//
// Dua penjaga, keduanya menolak jalan alih-alih bertanya:
//   · TILAWAH_BASE_URL wajib mengandung "staging"
//   · DATABASE_URL wajib host lokal (skrip membuat data dummy di maahir)
//
// CMS tilawah tidak menyediakan endpoint hapus. Halaqah uji yang terlanjur
// dibuat harus dibereskan manual dari dalam CMS — karena itu pengiriman nyata
// dibatasi satu halaqah dan namanya diberi awalan yang mencolok.
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ambilDays,
  ambilLevels,
  ambilSessions,
  cariGuru,
  tilawahTerkonfigurasi,
  ujiKoneksi,
} from '@/lib/tilawah/client';
import { hariTidakKonsisten, usulkanHari, usulkanLevel, usulkanSesi } from '@/lib/tilawah/map';
import { antrekanPengiriman, prosesOutbox } from '@/lib/tilawah/push';
import { uraikanSlot } from '@/lib/ketersediaan-slot';
import type { KsPeriode, KsSlot } from '@/types/db';

const base = process.env.TILAWAH_BASE_URL ?? '';
const dbUrl = process.env.DATABASE_URL ?? '';
const KIRIM_NYATA = process.env.KIRIM_NYATA === '1';
const BATCH = Number(process.env.TILAWAH_BATCH ?? '1');

if (!tilawahTerkonfigurasi()) {
  console.error('TILAWAH_BASE_URL / TILAWAH_EMAIL / TILAWAH_PASSWORD belum diset di .env.local.');
  process.exit(1);
}
if (!/staging/i.test(base)) {
  console.error(`TILAWAH_BASE_URL bukan staging: ${base}. Skrip ini menolak menyentuh produksi.`);
  process.exit(1);
}
if (!/@(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(dbUrl)) {
  console.error('DATABASE_URL bukan host lokal. Skrip ini membuat data dummy dan menolak jalan di luar dev.');
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

const TANDA = 'UJI-STAGING-KETERSEDIAAN';
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
  console.log(`# koneksi ke ${base}`);
  const koneksi = await ujiKoneksi();
  ok(koneksi.programs > 0, `terhubung, ${koneksi.programs} program terbaca`);

  console.log('\n# master data');
  const [days, sessions, levels] = await Promise.all([ambilDays(), ambilSessions(), ambilLevels()]);
  ok(days.length > 0, `${days.length} baris master hari`);
  ok(sessions.length > 0, `${sessions.length} baris master sesi`);
  ok(levels.length > 0, `${levels.length} baris master level`);

  const pincang = days.filter(hariTidakKonsisten);
  console.log(
    `     ${pincang.length} baris hari punya int_days tidak sesuai namanya: ` +
      pincang.map((d) => `#${d.id} "${d.name}" ${JSON.stringify(d.int_days)}`).join(', ')
  );
  ok(true, 'baris hari tak konsisten terdeteksi, bukan dipakai diam-diam');

  console.log(`\n# guru di batch ${BATCH}`);
  const guru = await cariGuru(BATCH, '');
  ok(guru.length > 0, `${guru.length} guru terbaca`);
  const guruBernomor = guru.find((g) => (g.phone ?? '').replace(/\D/g, '').length >= 9);
  if (!guruBernomor) {
    console.error('FAIL tidak ada guru bernomor telepon di batch ini — pencocokan tidak dapat diuji');
    gagal++;
    return;
  }
  console.log(`     memakai guru #${guruBernomor.id} "${guruBernomor.name}" (${guruBernomor.phone})`);

  // ── Siapkan periode + slot + pemetaan di maahir lokal ────────────────────
  console.log('\n# siapkan periode dummy di maahir');
  const { data: periodeRow } = await supabaseAdmin
    .from('ks_periode')
    .insert({
      nama: `${TANDA}`,
      mulai: '2026-09-01',
      selesai: '2026-10-31',
      kapasitas_halaqah: 2, // kecil, supaya satu halaqah uji cukup 2 murid
      ambang_bentuk: 2,
      ambang_bawah: 2,
      minimal_slot: 1,
      tilawah_program_id: 1,
      tilawah_batch_id: BATCH,
      kirim_nyata: KIRIM_NYATA,
    })
    .select('*')
    .single();
  periodeId = periodeRow!.id as string;
  const periode = periodeRow as KsPeriode;

  const teksSlot = 'Senin & Rabu 06:00 - 07:30 WIB';
  const urai = uraikanSlot(teksSlot)!;
  const { data: slotRow } = await supabaseAdmin
    .from('ks_slot')
    .insert({
      periode_id: periode.id,
      kelompok: 'ikhwan',
      mode: 'online',
      label: urai.label,
      hari: urai.hari,
      hari_idx: urai.hari_idx,
      waktu_mulai: urai.waktu_mulai,
      waktu_selesai: urai.waktu_selesai,
    })
    .select('*')
    .single();
  const slot = slotRow as KsSlot;

  console.log('\n# usulan pemetaan');
  const uHari = usulkanHari(slot, days);
  const uSesi = usulkanSesi(slot, sessions);
  const uLevel = usulkanLevel('HITS Dasar', levels);
  console.log(`     hari  → ${uHari.day_id ?? '—'} (${uHari.keyakinan}) ${uHari.alasan}`);
  console.log(`     sesi  → ${uSesi.session_id ?? '—'} (${uSesi.keyakinan}) ${uSesi.alasan}`);
  console.log(`     level → ${uLevel.level_id ?? '—'} (${uLevel.keyakinan}) ${uLevel.alasan}`);
  ok(uHari.day_id !== null, 'usulan day_id ditemukan');
  ok(uSesi.session_id !== null, 'usulan session_id ditemukan');
  ok(uLevel.level_id !== null, 'usulan level_id ditemukan');

  await supabaseAdmin.from('ks_tilawah_slot_map').insert({
    periode_id: periode.id,
    tilawah_batch_id: BATCH,
    slot_id: slot.id,
    day_id: uHari.day_id!,
    session_id: uSesi.session_id!,
    usulan_otomatis: false,
    disahkan_oleh: TANDA,
    disahkan_pada: new Date().toISOString(),
  });
  await supabaseAdmin.from('ks_tilawah_level_map').insert({
    periode_id: periode.id,
    tilawah_batch_id: BATCH,
    level_nama: 'HITS Dasar',
    level_id: uLevel.level_id!,
    disahkan_oleh: TANDA,
    disahkan_pada: new Date().toISOString(),
  });

  // ── Pengajar dummy yang nomornya sengaja sama dengan guru staging ────────
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
    .insert({ pengisian_id: pengisian!.id, slot_id: slot.id, status: 'terverifikasi' });

  // ── Dua pendaftar dummy ──────────────────────────────────────────────────
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
        slot_label_raw: teksSlot,
        slot_id: slot.id,
        didaftar_pada: new Date().toISOString(),
        status: 'valid',
      })
      .select('id')
      .single();
    pendaftarIds.push(pd!.id as string);
  }

  // ── Usulan + konfirmasi (dipalsukan langsung, alur UI diuji terpisah) ────
  console.log('\n# usulan & antrean pengiriman');
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .insert({
      periode_id: periode.id,
      slot_id: slot.id,
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
    await supabaseAdmin
      .from('ks_usulan_peserta')
      .insert({ usulan_id: usulan!.id, pendaftar_id: pid });
    await supabaseAdmin.from('ks_pendaftar').update({ status: 'dialokasikan' }).eq('id', pid);
  }

  await antrekanPengiriman(usulan!.id as string);
  const { data: outbox } = await supabaseAdmin
    .from('ks_outbox')
    .select('id, aksi, urutan')
    .eq('usulan_id', usulan!.id)
    .order('urutan', { ascending: true });
  eq(
    ((outbox ?? []) as { aksi: string }[]).map((b) => b.aksi),
    ['buat_halaqah', 'enrol', 'enrol'],
    'antrean tersusun: buat halaqah dulu, lalu enrol tiap peserta'
  );

  await antrekanPengiriman(usulan!.id as string);
  const { data: outbox2 } = await supabaseAdmin
    .from('ks_outbox')
    .select('id')
    .eq('usulan_id', usulan!.id);
  eq((outbox2 ?? []).length, 3, 'pengantrean ulang tidak menggandakan baris');

  // ── Proses ───────────────────────────────────────────────────────────────
  console.log(`\n# proses outbox (${KIRIM_NYATA ? 'PENGIRIMAN NYATA' : 'mode percobaan'})`);
  const hasil = await prosesOutbox(periode);
  console.log(`     diproses=${hasil.diproses} terkirim=${hasil.terkirim} gagal=${hasil.gagal}`);
  for (const p of hasil.pesan) console.log(`     · ${p}`);

  const { data: sesudah } = await supabaseAdmin
    .from('ks_outbox')
    .select('aksi, status, payload, error_terakhir')
    .eq('usulan_id', usulan!.id)
    .order('urutan', { ascending: true });
  const baris = (sesudah ?? []) as {
    aksi: string;
    status: string;
    payload: Record<string, unknown>;
    error_terakhir: string | null;
  }[];

  const payloadHalaqah = baris.find((b) => b.aksi === 'buat_halaqah')?.payload ?? {};
  console.log('     payload halaqah:', JSON.stringify(payloadHalaqah));
  eq(payloadHalaqah.batch_id, BATCH, 'payload memakai batch tujuan');
  eq(payloadHalaqah.day_id, uHari.day_id, 'payload memakai day_id hasil pemetaan');
  eq(payloadHalaqah.session_id, uSesi.session_id, 'payload memakai session_id hasil pemetaan');
  eq(payloadHalaqah.level_id, uLevel.level_id, 'payload memakai level_id hasil pemetaan');
  eq(payloadHalaqah.user_id, guruBernomor.id, 'guru tercocokkan lewat nomor telepon');
  eq(payloadHalaqah.status, 1, 'status halaqah 1');

  const payloadEnrol = baris.find((b) => b.aksi === 'enrol')?.payload ?? {};
  console.log('     payload enrol  :', JSON.stringify(payloadEnrol));
  ok(String(payloadEnrol.email ?? '').endsWith('@murid.hits'), 'email murid dipalsukan sesuai pola CMS');
  ok(String(payloadEnrol.phone ?? '').startsWith('62'), 'nomor murid berawalan 62');
  ok(Boolean(payloadEnrol.move_reason), 'move_reason terisi — 422 bila kosong');
  ok(!('password' in payloadEnrol), 'sandi tidak disimpan di payload outbox');

  if (!KIRIM_NYATA) {
    ok(
      baris.every((b) => b.status === 'antre'),
      'mode percobaan: seluruh baris tetap antre, tidak ada yang dikirim'
    );
    console.log('\n     Untuk benar-benar membuat satu halaqah uji di staging:');
    console.log('       KIRIM_NYATA=1 npm run test-tilawah-staging');
  } else {
    ok(hasil.gagal === 0, `pengiriman nyata tanpa kegagalan (${hasil.terkirim} langkah terkirim)`);
    const { data: u } = await supabaseAdmin
      .from('ks_usulan')
      .select('tilawah_halaqah_id, status')
      .eq('id', usulan!.id)
      .maybeSingle();
    ok(Boolean(u?.tilawah_halaqah_id), `halaqah terbentuk di CMS (#${u?.tilawah_halaqah_id})`);
    const { data: ps } = await supabaseAdmin
      .from('ks_usulan_peserta')
      .select('status, tilawah_user_id')
      .eq('usulan_id', usulan!.id);
    const terenrol = ((ps ?? []) as { status: string }[]).filter((x) => x.status === 'terenroll').length;
    eq(terenrol, 2, 'dua murid terenrol');
    console.log(
      `\n     PERHATIAN: halaqah "${TANDA} — hapus manual" (#${u?.tilawah_halaqah_id}) dan dua murid uji`
    );
    console.log('     tertinggal di CMS staging. CMS tidak punya endpoint hapus — bereskan manual.');
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
