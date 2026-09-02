// Uji pembacaan & saringan pendaftar terhadap SHEET SUNGGUHAN.
// Jalankan: npm run test-pendaftar-sheet
//
// Hanya membaca: menarik CSV publish-to-web, mengurainya, dan melaporkan berapa
// baris lolos serta kenapa sisanya ditahan. Tidak menyentuh basis data mana pun.
//
// Gunanya bukan sekadar lulus/gagal — angka "ditahan" per alasan adalah yang
// dipakai koordinator memutuskan apakah datanya perlu dibereskan di sheet.
import { bacaCsv, saring, tebakPemetaan } from '@/lib/ketersediaan-pendaftar';
import { siapkanSlot, SLOT_BAWAAN } from '@/lib/ketersediaan-periode';
import { uraikanSlot } from '@/lib/ketersediaan-slot';
import type { KsSlot } from '@/types/db';

const URL_CSV =
  process.env.SHEET_PENDAFTAR ??
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSS59U324L1rNSO5xKtHt7vqVdaca7HsdelFIbQdH4VCxPSYfMYAjPvCl_91Y0WcBb-lNmxTY8bLYdg/pub?output=csv';

let gagal = 0;
function ok(cond: boolean, label: string) {
  if (cond) console.log(`ok   ${label}`);
  else {
    console.error(`FAIL ${label}`);
    gagal++;
  }
}

/** Master slot bawaan, dibentuk tanpa basis data. */
function masterSlot(): KsSlot[] {
  const { baris } = siapkanSlot('periode-uji', SLOT_BAWAAN);
  return baris.map((b, i) => ({
    id: `slot-${i}`,
    periode_id: 'periode-uji',
    kelompok: b.kelompok,
    mode: b.mode,
    label: b.label,
    hari: b.hari,
    hari_idx: b.hari_idx as KsSlot['hari_idx'],
    waktu_mulai: b.waktu_mulai,
    waktu_selesai: b.waktu_selesai,
    lokasi: b.lokasi,
    aktif: true,
    urutan: b.urutan,
    created_at: '',
    updated_at: '',
  }));
}

async function main() {
  const res = await fetch(URL_CSV, { redirect: 'follow' });
  ok(res.ok, `CSV terbaca (HTTP ${res.status})`);
  const teks = await res.text();
  ok(!teks.includes('<html'), 'CSV bukan halaman HTML — sheet sudah publish-to-web');

  const kepala = (teks.split('\n')[0] ?? '').split(',');
  const petakan = tebakPemetaan(
    // Kepala berisi koma di dalam tanda kutip; pakai penguraian yang benar.
    bacaCsv(teks, {}).kepala.length ? bacaCsv(teks, {}).kepala : kepala
  );
  console.log('\n# pemetaan kolom hasil tebakan');
  for (const [k, v] of Object.entries(petakan)) console.log(`  ${k.padEnd(14)} → ${String(v).slice(0, 58)}`);

  ok(Boolean(petakan.timestamp), 'kolom timestamp terdeteksi');
  ok(Boolean(petakan.nama), 'kolom nama terdeteksi');
  ok(Boolean(petakan.wa), 'kolom WA terdeteksi');
  ok(Boolean(petakan.slot), 'kolom slot terdeteksi');
  ok(Boolean(petakan.umur), 'kolom usia terdeteksi');
  ok(Boolean(petakan.level), 'kolom level terdeteksi');
  ok(Boolean(petakan.rekaman), 'kolom rekaman terdeteksi');
  if (!petakan.tanggal_lahir) {
    console.log(
      '     catatan: kolom tanggal lahir tidak tertebak — di sheet ini judulnya "Column 7",\n' +
        '     tanpa nama sama sekali. Koordinator memetakannya manual di layar sumber pendaftar.'
    );
  }

  const { baris } = bacaCsv(teks, petakan);
  console.log(`\n# ${baris.length} baris terbaca`);
  ok(baris.length > 0, 'ada baris data');

  const berumur = baris.filter((b) => b.tanggal_lahir || b.umur_isian).length;
  console.log(`  ${baris.filter((b) => b.tanggal_lahir).length} punya tanggal lahir terbaca`);
  console.log(`  ${baris.filter((b) => b.umur_isian).length} punya kolom usia`);
  console.log(`  ${berumur} dapat ditentukan umurnya`);
  ok(berumur / baris.length > 0.95, 'lebih dari 95% baris dapat ditentukan umurnya');

  const lahir = baris.filter((b) => b.tanggal_lahir);
  if (lahir.length) {
    const tahun = lahir.map((b) => Number(b.tanggal_lahir!.slice(0, 4)));
    console.log(`  rentang tahun lahir: ${Math.min(...tahun)}–${Math.max(...tahun)}`);
    ok(Math.min(...tahun) > 1930 && Math.max(...tahun) < 2015, 'tahun lahir masuk akal');
  }

  const slots = masterSlot();
  const hasil = saring(baris, slots, new Date());
  const sah = hasil.filter((h) => h.status === 'valid');
  const ditahan = hasil.filter((h) => h.status === 'ditahan');
  console.log(`\n# ${sah.length} sah · ${ditahan.length} ditahan`);

  const alasan = new Map<string, number>();
  for (const d of ditahan) {
    for (const a of d.alasan_ditahan) {
      const kunci = a.replace(/"[^"]*"/, '"…"');
      alasan.set(kunci, (alasan.get(kunci) ?? 0) + 1);
    }
  }
  console.log('\n# alasan penahanan');
  for (const [a, n] of [...alasan].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(n).padStart(5)}  ${a}`);
  }

  // Nilai slot yang gagal diurai — inilah yang perlu dilihat manusia.
  const slotGagal = new Map<string, number>();
  for (const b of baris) {
    if (!b.slot_label_raw) continue;
    if (b.slot_label_raw === 'This choice no longer accepts responses') continue;
    if (!uraikanSlot(b.slot_label_raw)) {
      slotGagal.set(b.slot_label_raw, (slotGagal.get(b.slot_label_raw) ?? 0) + 1);
    }
  }
  console.log('\n# pilihan jam yang tidak dapat diurai');
  if (slotGagal.size === 0) console.log('  (tidak ada)');
  for (const [v, n] of [...slotGagal].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(n).padStart(5)}  ${v}`);
  }

  // Slot terurai tetapi tak ada padanannya di master — kandidat slot baru.
  const takAdaMaster = new Map<string, number>();
  for (const h of ditahan) {
    if (!h.slot_label_raw || h.slot_id) continue;
    if (!h.alasan_ditahan.some((a) => a.includes('tidak ada di master'))) continue;
    takAdaMaster.set(h.slot_label_raw, (takAdaMaster.get(h.slot_label_raw) ?? 0) + 1);
  }
  console.log('\n# terurai tetapi belum ada di MASTER_SLOT');
  if (takAdaMaster.size === 0) console.log('  (tidak ada)');
  for (const [v, n] of [...takAdaMaster].sort((x, y) => y[1] - x[1])) {
    const u = uraikanSlot(v);
    console.log(`  ${String(n).padStart(5)}  ${v}\n         → ${u?.label ?? '?'}${u?.lokasi ? ` · lokasi "${u.lokasi}"` : ''}`);
  }

  console.log(gagal === 0 ? '\nSEMUA LULUS' : `\n${gagal} GAGAL`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('GALAT:', e);
  process.exit(1);
});
