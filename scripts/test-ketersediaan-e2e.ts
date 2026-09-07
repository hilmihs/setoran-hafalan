// Uji ujung-ke-ujung Ketersediaan Mengajar HITS terhadap DATABASE_URL.
// Jalankan: npm run test-ketersediaan-e2e
//
// HANYA UNTUK DB DEV. Skrip ini membuat satu periode percobaan berikut slot,
// pengisian, pendaftar, dan usulannya, lalu MENGHAPUSNYA di akhir. Semua tabel
// ks_* berakar pada ks_periode dengan hapus berjenjang, sehingga satu perintah
// hapus membersihkan seluruh jejaknya.
//
// Menolak jalan bila DATABASE_URL mengarah ke host non-lokal, supaya tidak
// pernah menyentuh produksi karena salah env.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { siapkanSlot, SLOT_BAWAAN } from '@/lib/ketersediaan-periode';
import { jalankanAlokasi } from '@/lib/ketersediaan-jalankan';
import { ringkasSlot } from '@/lib/ketersediaan-permintaan';
import { bacaCsv, saring, tebakPemetaan } from '@/lib/ketersediaan-pendaftar';
import { bangunWorkbook } from '@/lib/ketersediaan-export';
import { geserYangKedaluwarsa, terbitkanToken } from '@/lib/ketersediaan-konfirmasi';
import { catatRiwayatPeriode, ringkasDitahan } from '@/lib/ketersediaan-ditahan';
import type { KsPeriode, KsSlot } from '@/types/db';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(url)) {
  console.error('DATABASE_URL bukan host lokal. Skrip ini menolak jalan di luar dev.');
  console.error(`  DATABASE_URL = ${url.replace(/:[^:@/]+@/, ':***@')}`);
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

const TANDA = 'UJI-E2E-KETERSEDIAAN';
let periodeId: string | null = null;
const pengajarDibuat: string[] = [];
let kelompokDibuat: string | null = null;

/**
 * Bersihkan lalu BUKTIKAN bersih.
 *
 * Pemeriksaan ini ada karena pernah gagal diam-diam: dua rujukan ON DELETE
 * RESTRICT menahan cascade dari ks_periode, sehingga penghapusan tidak
 * berpengaruh apa-apa sementara skrip tetap melaporkan sukses. Membersihkan
 * tanpa memverifikasi sama saja tidak membersihkan.
 */
async function bersihkan() {
  // ks_slot_riwayat sengaja TIDAK berakar pada periode_id — ia bertahan setelah
  // periodenya dibuang, karena itulah gunanya sebagai riwayat lintas periode.
  // Maka data ujinya dihapus terpisah, berdasarkan label periode.
  await supabaseAdmin.from('ks_slot_riwayat').delete().eq('periode_label', `${TANDA} September 2026`);
  if (periodeId) await supabaseAdmin.from('ks_periode').delete().eq('id', periodeId);
  for (const id of pengajarDibuat) await supabaseAdmin.from('pengajar').delete().eq('id', id);
  if (kelompokDibuat) await supabaseAdmin.from('kelompok_pengajar').delete().eq('id', kelompokDibuat);

  if (!periodeId) return;
  const sisa: string[] = [];
  const { data: periodeSisa } = await supabaseAdmin.from('ks_periode').select('id').eq('id', periodeId);
  if ((periodeSisa ?? []).length > 0) sisa.push('ks_periode');
  for (const tabel of ['ks_slot', 'ks_pendaftar', 'ks_usulan'] as const) {
    const { data } = await supabaseAdmin.from(tabel).select('id').eq('periode_id', periodeId);
    if ((data ?? []).length > 0) sisa.push(`${tabel} (${(data ?? []).length})`);
  }
  if (sisa.length > 0) {
    console.error(`FAIL pembersihan menyisakan baris: ${sisa.join(', ')}`);
    gagal++;
  } else {
    console.log('ok   pembersihan terverifikasi bersih');
  }
}

async function main() {
  const sekarang = new Date('2026-09-01T03:00:00Z');

  // ── Periode + master slot ────────────────────────────────────────────────
  const { data: periode, error: ePeriode } = await supabaseAdmin
    .from('ks_periode')
    .insert({
      nama: `${TANDA} September 2026`,
      mulai: '2026-09-01',
      selesai: '2026-10-31',
      minimal_slot: 3,
      kapasitas_halaqah: 12,
      ambang_bawah: 8,
      usia_antrean_maks_hari: 21,
      tenggat_konfirmasi_jam: 48,
    })
    .select('*')
    .single();
  if (ePeriode || !periode) throw new Error(`gagal membuat periode: ${ePeriode?.message}`);
  periodeId = periode.id as string;
  const p = periode as KsPeriode;
  console.log(`\n# periode ${p.nama}`);

  const { baris, gagal: gagalUrai } = siapkanSlot(p.id, SLOT_BAWAAN);
  eq(gagalUrai, [], 'seluruh slot bawaan terurai');
  eq(baris.length, 27, '27 slot bawaan siap disisip');
  for (const b of baris) await supabaseAdmin.from('ks_slot').insert(b);

  const { data: slotRows } = await supabaseAdmin.from('ks_slot').select('*').eq('periode_id', p.id);
  const slots = (slotRows ?? []) as KsSlot[];
  eq(slots.length, 27, '27 slot tersimpan');
  ok(
    slots.every((s) => s.hari_idx.length === s.hari.length && s.hari_idx.length > 0),
    'tiap slot punya hari_idx sepadan'
  );
  const offline = slots.filter((s) => s.mode === 'offline');
  ok(
    offline.length === 4 && offline.every((s) => s.lokasi === 'Offline'),
    '4 slot offline berlokasi bawaan "Offline"'
  );

  const slotSeninRabuPagi = slots.find(
    (s) => s.kelompok === 'ikhwan' && s.mode === 'online' && s.label.startsWith('Senin & Rabu 06:00')
  );
  const slotSelasaKamisPagi = slots.find(
    (s) => s.kelompok === 'ikhwan' && s.mode === 'online' && s.label.startsWith('Selasa & Kamis 06:00')
  );
  ok(Boolean(slotSeninRabuPagi && slotSelasaKamisPagi), 'dua slot ikhwan pagi ditemukan');
  if (!slotSeninRabuPagi || !slotSelasaKamisPagi) throw new Error('slot uji tidak ada');

  // ── Pengajar percobaan ───────────────────────────────────────────────────
  console.log('\n# pengajar & ketersediaan');
  const { data: kel } = await supabaseAdmin
    .from('kelompok_pengajar')
    .insert({ name: `${TANDA} Kelompok`, gender: 'ikhwan' })
    .select('id')
    .single();
  kelompokDibuat = kel!.id as string;

  const namaPengajar = ['Uji Alif', 'Uji Ba', 'Uji Jim'];
  const pengajarIds: string[] = [];
  for (let i = 0; i < namaPengajar.length; i++) {
    const { data: pg } = await supabaseAdmin
      .from('pengajar')
      .insert({
        name: `${TANDA} ${namaPengajar[i]}`,
        gender: 'ikhwan',
        whatsapp_number: `8999900${String(i).padStart(4, '0')}`,
        password_hash: 'x',
        kelompok_id: kelompokDibuat,
        active: true,
      })
      .select('id')
      .single();
    pengajarIds.push(pg!.id as string);
    pengajarDibuat.push(pg!.id as string);
  }
  eq(pengajarIds.length, 3, '3 pengajar percobaan dibuat');

  // Ketiganya bersedia di dua slot pagi yang berbeda hari (tidak saling bentrok).
  for (let i = 0; i < pengajarIds.length; i++) {
    const { data: pengisian } = await supabaseAdmin
      .from('ks_pengisian')
      .insert({
        periode_id: p.id,
        pengajar_id: pengajarIds[i],
        mode: 'online',
        komitmen: true,
        // Waktu pengisian berurutan → dipakai sebagai prioritas cadangan.
        submitted_at: new Date(sekarang.getTime() + i * 60000).toISOString(),
      })
      .select('id')
      .single();
    for (const slot of [slotSeninRabuPagi, slotSelasaKamisPagi]) {
      await supabaseAdmin.from('ks_ketersediaan').insert({
        pengisian_id: pengisian!.id,
        slot_id: slot.id,
        status: 'terverifikasi',
      });
    }
  }

  // ── Pendaftar lewat jalur CSV ────────────────────────────────────────────
  console.log('\n# pendaftar lewat penguraian CSV');
  const kepala = 'Timestamp,Nama Lengkap,Nomor WhatsApp,Tanggal Lahir,Jenis Kelamin,Level,Pilihan Slot';
  const barisCsv: string[] = [kepala];
  // 24 pendaftar sah di slot Senin & Rabu → cukup untuk 2 halaqah penuh.
  for (let i = 0; i < 24; i++) {
    barisCsv.push(
      `01/08/2026 08.0${i % 10}.00,Murid Uji ${i},08199900${String(i).padStart(4, '0')},17/05/2001,Ikhwan,HITS Dasar,Senin & Rabu 06.00 - 07.30 WIB`
    );
  }
  // 12 pendaftar sah di slot Selasa & Kamis → 1 halaqah.
  for (let i = 0; i < 12; i++) {
    barisCsv.push(
      `01/08/2026 09.0${i % 10}.00,Murid Kamis ${i},08188800${String(i).padStart(4, '0')},17/05/1996,Ikhwan,HITS Dasar,Selasa & Kamis 06:00 - 07:30 WIB`
    );
  }
  // Baris rusak yang harus DITAHAN, bukan dibuang.
  barisCsv.push(`01/08/2026 10.00.00,,081999000099,17/05/2001,Ikhwan,HITS Dasar,Senin & Rabu 06:00 - 07:30 WIB`);
  barisCsv.push(`01/08/2026 10.01.00,Murid Tanpa WA,,17/05/2001,Ikhwan,HITS Dasar,Senin & Rabu 06:00 - 07:30 WIB`);
  barisCsv.push(`01/08/2026 10.02.00,Murid Kembar,081777000001,17/05/2001,Ikhwan,HITS Dasar,Senin & Rabu 06:00 - 07:30 WIB`);
  barisCsv.push(`01/08/2026 10.03.00,Murid Kembar Dua,081777000001,17/05/2001,Ikhwan,HITS Dasar,Senin & Rabu 06:00 - 07:30 WIB`);
  barisCsv.push(`01/08/2026 10.04.00,Murid Slot Ngawur,081666000001,17/05/2001,Ikhwan,HITS Dasar,Rabu Malam Jam Berapa Saja`);

  const petakan = tebakPemetaan(kepala.split(','));
  eq(petakan.nama, 'Nama Lengkap', 'tebakan kolom nama');
  eq(petakan.wa, 'Nomor WhatsApp', 'tebakan kolom WA');
  eq(petakan.slot, 'Pilihan Slot', 'tebakan kolom slot');
  eq(petakan.timestamp, 'Timestamp', 'tebakan kolom timestamp');

  const { baris: mentah } = bacaCsv(barisCsv.join('\n'), petakan);
  eq(mentah.length, 41, '41 baris terbaca dari CSV');

  const siap = saring(mentah, slots, sekarang);
  const sah = siap.filter((s) => s.status === 'valid');
  const ditahan = siap.filter((s) => s.status === 'ditahan');
  eq(sah.length, 36, '36 baris lolos saringan');
  eq(ditahan.length, 5, '5 baris ditahan, bukan dibuang');
  ok(
    ditahan.some((d) => d.alasan_ditahan.some((a) => a.includes('lebih dari satu pendaftar'))),
    'nomor WA ganda tertangkap'
  );
  ok(
    ditahan.some((d) => d.alasan_ditahan.some((a) => a.includes('Nama kosong'))),
    'nama kosong tertangkap'
  );
  ok(
    ditahan.some((d) => d.alasan_ditahan.some((a) => a.includes('tidak dapat diurai'))),
    'slot ngawur tertangkap dengan alasan yang tepat'
  );
  // Ejaan "06.00" (titik) pada CSV harus cocok ke master yang memakai "06:00".
  ok(
    sah.filter((s) => s.slot_id === slotSeninRabuPagi.id).length === 24,
    'ejaan titik pada CSV tetap cocok ke slot master'
  );

  for (const b of siap) {
    await supabaseAdmin.from('ks_pendaftar').insert({
      periode_id: p.id,
      sumber_row_key: b.sumber_row_key,
      nama: b.nama,
      wa: b.wa,
      wa_normal: b.wa_normal,
      tanggal_lahir: b.tanggal_lahir,
      umur: b.umur,
      pita_umur: b.pita_umur,
      gender: b.gender,
      level_pilihan: b.level_pilihan,
      slot_label_raw: b.slot_label_raw,
      slot_id: b.slot_id,
      didaftar_pada: b.didaftar_pada,
      status: b.status,
      alasan_ditahan: b.alasan_ditahan,
    });
  }

  // ── Ringkasan pasokan vs permintaan ──────────────────────────────────────
  console.log('\n# ringkasan slot');
  const ringkas = await ringkasSlot(p, slots, sekarang);
  const rSenin = ringkas.get(slotSeninRabuPagi.id)!;
  eq(rSenin.antre, 24, 'Senin & Rabu: 24 antre');
  eq(rSenin.pengajar_tersedia, 3, 'Senin & Rabu: 3 pengajar tersedia');
  eq(rSenin.butuh_halaqah, 2, 'Senin & Rabu: butuh 2 halaqah');
  eq(rSenin.belum_tertampung, 0, 'Senin & Rabu: semua tertampung');
  eq(rSenin.ditahan, 4, 'Senin & Rabu: 4 baris ditahan tercatat');

  // ── Alokasi ──────────────────────────────────────────────────────────────
  console.log('\n# alokasi berputar');
  const hasil = await jalankanAlokasi(p, { sekarang });
  eq(hasil.usulanBaru, 3, '3 usulan halaqah terbentuk (2 Senin + 1 Kamis)');
  eq(hasil.pesertaTerpakai, 36, '36 murid masuk usulan');

  const { data: usulanRows } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, slot_id, pengajar_id, putaran, level, pita_umur')
    .eq('periode_id', p.id);
  const usulan = (usulanRows ?? []) as {
    id: string;
    slot_id: string;
    pengajar_id: string;
    putaran: number;
    level: string;
    pita_umur: string | null;
  }[];
  eq(usulan.length, 3, '3 baris usulan tersimpan');
  eq(
    usulan.filter((u) => u.putaran === 1).length,
    3,
    'ketiganya lahir di putaran 1 — semua pengajar kebagian dulu'
  );
  eq(
    new Set(usulan.map((u) => u.pengajar_id)).size,
    3,
    'tiga pengajar berbeda, tidak ada yang memborong'
  );
  ok(
    usulan.every((u) => u.level === 'HITS Dasar'),
    'satu halaqah satu level'
  );

  // Pengajar yang dapat slot Senin pagi tidak boleh juga dapat slot Selasa pagi
  // bila jamnya bentrok — di sini harinya beda, jadi tidak bentrok. Yang diuji:
  // tak seorang pun memegang dua halaqah di SLOT yang sama.
  const perSlot = new Map<string, Set<string>>();
  for (const u of usulan) {
    if (!perSlot.has(u.slot_id)) perSlot.set(u.slot_id, new Set());
    perSlot.get(u.slot_id)!.add(u.pengajar_id);
  }
  ok(
    [...perSlot.entries()].every(([slotId, set]) => set.size === usulan.filter((u) => u.slot_id === slotId).length),
    'tidak ada pengajar dobel dalam satu slot'
  );

  const { data: sisaValid } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id')
    .eq('periode_id', p.id)
    .eq('status', 'valid');
  eq((sisaValid ?? []).length, 0, 'tidak ada pendaftar sah tersisa di antrean');

  // Jalankan lagi: tidak boleh menggandakan apa pun.
  const ulang = await jalankanAlokasi(p, { sekarang });
  eq(ulang.usulanBaru, 0, 'alokasi ulang tidak membentuk usulan baru');

  // ── Pergeseran karena lewat tenggat ──────────────────────────────────────
  console.log('\n# pergeseran lewat tenggat');
  const targetGeser = usulan.find((u) => u.slot_id === slotSelasaKamisPagi.id)!;
  await supabaseAdmin
    .from('ks_usulan')
    .update({
      status: 'menunggu',
      akses_token: terbitkanToken(),
      token_kedaluwarsa: new Date(sekarang.getTime() - 3600000).toISOString(),
    })
    .eq('id', targetGeser.id);

  const geser = await geserYangKedaluwarsa(p, sekarang);
  eq(geser.digeser, 1, '1 usulan digeser ke prioritas berikutnya');

  const { data: setelahGeser } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, status, pengajar_id, slot_id')
    .eq('periode_id', p.id)
    .eq('slot_id', slotSelasaKamisPagi.id);
  const barisGeser = (setelahGeser ?? []) as { id: string; status: string; pengajar_id: string }[];
  eq(barisGeser.filter((b) => b.status === 'kedaluwarsa').length, 1, 'yang lama ditandai kedaluwarsa');
  const penerus = barisGeser.find((b) => b.status === 'usulan');
  ok(Boolean(penerus), 'usulan pengganti terbentuk');
  ok(penerus?.pengajar_id !== targetGeser.pengajar_id, 'pengganti bukan orang yang sama');

  const { data: pesertaPindah } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id')
    .eq('usulan_id', penerus!.id);
  eq((pesertaPindah ?? []).length, 12, 'peserta ikut pindah utuh, tidak kembali ke antrean');

  // ── Pendaftar ditahan ────────────────────────────────────────────────────
  console.log('\n# ringkasan pendaftar ditahan');
  const rd = await ringkasDitahan(p.id);
  eq(rd.total, 5, '5 baris tertahan terbaca dari basis data');
  ok(rd.perAlasan.length >= 3, `alasan dikelompokkan (${rd.perAlasan.length} macam)`);
  ok(
    rd.perAlasan.every((a) => a.jumlah > 0),
    'tiap alasan membawa jumlah'
  );
  ok(
    rd.slotAsing.some((s) => s.nilai.includes('Rabu Malam')),
    'nilai slot asing dilaporkan utuh agar bisa ditindaklanjuti'
  );
  ok(rd.baris.length === 5, 'barisnya ikut terbawa untuk ditampilkan');

  // ── Riwayat slot ─────────────────────────────────────────────────────────
  console.log('\n# pencatatan riwayat slot');
  const riwayat1 = await catatRiwayatPeriode(p.id);
  ok(riwayat1.slot > 0, `${riwayat1.slot} slot tercatat ke riwayat`);

  const { data: barisRiwayat } = await supabaseAdmin
    .from('ks_slot_riwayat')
    .select('slot_label, halaqah_terbentuk, halaqah_batal, pendaftar, sumber')
    .eq('periode_label', p.nama);
  const rw = (barisRiwayat ?? []) as {
    slot_label: string;
    halaqah_terbentuk: number;
    halaqah_batal: number;
    pendaftar: number;
    sumber: string;
  }[];
  eq(rw.length, riwayat1.slot, 'jumlah baris riwayat sama dengan yang dilaporkan');
  ok(rw.every((r) => r.sumber === 'sistem'), 'seluruhnya bertanda sumber sistem');
  ok(rw.some((r) => r.pendaftar > 0), 'jumlah pendaftar ikut tercatat');

  // Dijalankan ulang tidak boleh menggandakan.
  const riwayat2 = await catatRiwayatPeriode(p.id);
  eq(riwayat2.slot, riwayat1.slot, 'pencatatan ulang menghasilkan jumlah yang sama');
  const { data: barisRiwayat2 } = await supabaseAdmin
    .from('ks_slot_riwayat')
    .select('id')
    .eq('periode_label', p.nama);
  eq((barisRiwayat2 ?? []).length, rw.length, 'pencatatan ulang tidak menggandakan baris');

  // ── Ekspor xlsx ──────────────────────────────────────────────────────────
  console.log('\n# ekspor xlsx');
  const wb = await bangunWorkbook(p);
  const namaSheet = wb.worksheets.map((w) => w.name);
  eq(
    namaSheet,
    ['PETUNJUK', 'MASTER_SLOT', 'KERJA', 'IKHWAN', 'AKHWAT', 'OFFLINE', 'REKAP_SLOT', 'LOG_PERUBAHAN'],
    'susunan sheet sama dengan template'
  );

  const wsMaster = wb.getWorksheet('MASTER_SLOT')!;
  eq(wsMaster.rowCount, 28, 'MASTER_SLOT: 1 kepala + 27 slot');

  const wsKerja = wb.getWorksheet('KERJA')!;
  eq(
    wsKerja.getRow(1).values,
    [
      undefined,
      'Timestamp',
      'Periode / Batch',
      'Nama',
      'WA',
      'Kelompok',
      'Mode',
      'Lokasi',
      'Waktu',
      'Skor Kompetensi (1-5)',
      'Skor Kedisiplinan (1-5)',
      'Skor Komitmen (1-5)',
      'Skor Total',
      'Status Verifikasi',
      'Prioritas',
      'Catatan',
    ],
    'KERJA: 15 kolom sama persis dengan template'
  );
  eq(wsKerja.rowCount, 7, 'KERJA: 1 kepala + 6 baris (3 pengajar × 2 slot)');

  const wsIkhwan = wb.getWorksheet('IKHWAN')!;
  eq(wsIkhwan.getRow(1).values, [undefined, 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas'], 'IKHWAN: 5 kolom Jadwal KBM');
  eq(wsIkhwan.rowCount, 7, 'IKHWAN: 6 baris terverifikasi');
  // Prioritas harus terisi 1..n per slot, bukan kosong.
  const prioritas = [];
  for (let r = 2; r <= wsIkhwan.rowCount; r++) prioritas.push(wsIkhwan.getRow(r).getCell(5).value);
  ok(
    prioritas.every((v) => typeof v === 'number' && v >= 1),
    'kolom Prioritas terisi angka'
  );

  const wsRekap = wb.getWorksheet('REKAP_SLOT')!;
  eq(wsRekap.rowCount, 28, 'REKAP_SLOT: satu baris per slot');
  const barisSenin = (() => {
    for (let r = 2; r <= wsRekap.rowCount; r++) {
      if (String(wsRekap.getRow(r).getCell(4).value ?? '').startsWith('Senin & Rabu 06:00')) {
        return wsRekap.getRow(r);
      }
    }
    return null;
  })();
  ok(barisSenin !== null && barisSenin.getCell(5).value === 3, 'REKAP_SLOT: 3 pengajar terverifikasi di slot Senin pagi');

  const wsLog = wb.getWorksheet('LOG_PERUBAHAN')!;
  ok(wsLog.rowCount > 1, 'LOG_PERUBAHAN terisi jejak');

  const buf = await wb.xlsx.writeBuffer();
  ok(buf.byteLength > 5000, `berkas xlsx terbentuk (${Math.round(buf.byteLength / 1024)} KB)`);
}

main()
  .catch((e) => {
    console.error('\nGALAT:', e);
    gagal++;
  })
  .finally(async () => {
    await bersihkan();
    console.log(gagal === 0 ? '\nSEMUA LULUS (data percobaan dibersihkan)' : `\n${gagal} GAGAL`);
    process.exit(gagal === 0 ? 0 : 1);
  });
