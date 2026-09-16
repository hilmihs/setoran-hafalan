/**
 * test-ketersediaan-impor.ts — uji integrasi Ketersediaan terhadap Postgres
 * sungguhan (PGlite lewat wire-protocol), memakai migrasi ks_* yang ASLI dan lib
 * aplikasi apa adanya. Tidak menyentuh produksi maupun berkas xlsx asli.
 *
 * Jalankan: npm run test-ketersediaan-impor
 * Opsional: KS_XLSX=/jalur/berkas.xlsx untuk ikut memeriksa berkas nyata.
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

/**
 * Berkas tiruan dengan susunan yang sama persis dengan berkas nyata 16 Sep 2026:
 * sheet online bertumpuk dua batch, sheet offline tanpa WA, Matraman bertumpuk
 * ikhwan lalu akhwat, dan satu kelas dengan dua waktu berbeda.
 */
async function xlsxTiruan(opsi: { tanpaBaris?: 'bilal-sabtu' } = {}): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  const on = wb.addWorksheet('Online - Ikhwan');
  on.addRow(['KETERSEDIAAN PENGAJAR HITS ONLINE — IKHWAN']);
  on.addRow([]);
  on.addRow(['Batch September 2026 (mulai 3 September 2026)']);
  on.addRow(['No', 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  on.addRow([1, 'Ahmad Fauzan', '081111111111', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 1]);
  on.addRow([2, 'Bilal Hakim', '081222222222', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 2]);
  if (opsi.tanpaBaris !== 'bilal-sabtu') {
    on.addRow([3, 'Bilal Hakim', '081222222222', 'Online', 'Sabtu & Ahad 13:00 - 14:30 WIB', 1]);
  }
  on.addRow([4, 'Tanpa Akun', '089999999999', 'Online', 'Sabtu & Ahad 13:00 - 14:30 WIB', 2]);
  on.addRow([]);
  on.addRow(['Batch Oktober 2026 (mulai 19 Oktober 2026)']);
  on.addRow(['No', 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  on.addRow([1, 'Bilal Hakim', '081222222222', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 1]);
  on.addRow([2, 'Ahmad Fauzan', '081111111111', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 2]);

  const pj = wb.addWorksheet('Offline - Pejaten Akhwat');
  pj.addRow(['JADWAL KBM HITS OFFLINE — Lokasi Pejaten AKHWAT (Batch September 2026)']);
  pj.addRow([]);
  pj.addRow(['Akhwat']);
  pj.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  pj.addRow([1, 'Ustadzah Khadijah Maryam', 'Offline', "Selasa & Jum'at, 09.00 - 10.30", 'Kelas A']);
  pj.addRow([2, 'Nama Asing', 'Offline', 'Senin & Kamis, 09.00 - 10.30', 'Kelas B']);

  const mt = wb.addWorksheet('Offline - Al-Kautsar Matraman');
  mt.addRow(['JADWAL KBM HITS OFFLINE — Lokasi Masjid Al-Kautsar Matraman (Batch September 2026)']);
  mt.addRow([]);
  mt.addRow(['Ikhwan']);
  mt.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  mt.addRow([1, 'Bilal Hakim', 'Offline', 'Selasa dan Kamis 20.00 - 21.30']);
  mt.addRow([]);
  mt.addRow(['Akhwat']);
  mt.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  mt.addRow([1, 'Aisyah Rahma', 'Offline', 'Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30']);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

async function main() {
  console.log('\n# pembaca xlsx');
  {
    const { bacaKetersediaanXlsx } = await import('../src/lib/ketersediaan-impor-xlsx');
    const hasil = await bacaKetersediaanXlsx(await xlsxTiruan());
    const ringkas = hasil.bagian.map((b) => `${b.kunci}:${b.baris.length}`).join();
    check(
      'tiga bagian dengan jumlah baris benar',
      ringkas === 'online|September 2026:4,online|Oktober 2026:2,offline|September 2026:4',
      ringkas
    );
    const semua = hasil.bagian.flatMap((b) => b.baris);
    const ahmad = semua.find((b) => b.nama === 'Ahmad Fauzan' && b.bagian === 'online|September 2026');
    check('WA dinormalkan', ahmad?.wa === '81111111111', String(ahmad?.wa));
    check('prioritas terbaca', ahmad?.prioritas === 1, String(ahmad?.prioritas));
    check('jam terurai', ahmad?.slot?.label === 'Senin & Rabu 20:00 - 21:30 WIB', String(ahmad?.slot?.label));
    const pejaten = semua.find((b) => b.sheet === 'Offline - Pejaten Akhwat');
    check('lokasi Pejaten dari judul', pejaten?.lokasi === 'Pejaten', String(pejaten?.lokasi));
    check('offline tanpa kolom WA → wa null', pejaten?.wa === null);
    const matIkhwan = semua.find((b) => b.sheet === 'Offline - Al-Kautsar Matraman' && b.gender === 'ikhwan');
    check('lokasi Matraman utuh', matIkhwan?.lokasi === 'Masjid Al-Kautsar Matraman', String(matIkhwan?.lokasi));
    const aisyah = semua.find((b) => b.nama === 'Aisyah Rahma');
    check('bagian kedua Matraman bergender akhwat', aisyah?.gender === 'akhwat');
    check('jam dua waktu ditandai', aisyah?.masalah.join() === 'dua_waktu' && aisyah?.slot === null, JSON.stringify(aisyah?.masalah));
    check('tidak ada baris terlewat', hasil.terlewat.length === 0, JSON.stringify(hasil.terlewat));

    if (process.env.KS_XLSX) {
      const buf = readFileSync(process.env.KS_XLSX);
      const nyata = await bacaKetersediaanXlsx(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      );
      const baris = nyata.bagian.flatMap((b) => b.baris);
      check('berkas nyata: 179 baris', baris.length === 179, String(baris.length));
      check('berkas nyata: 3 jam dua waktu', baris.filter((b) => b.masalah.includes('dua_waktu')).length === 3);
      check('berkas nyata: tiga bagian', nyata.bagian.length === 3, nyata.bagian.map((b) => b.kunci).join());
    }
  }

  console.log('\n# pencocokan akun pengajar');
  {
    const { cocokkanPengajar, namaPengajarNormal } = await import('../src/lib/ketersediaan-impor-cocok');
    const daftar = [
      { id: 'p-adam', name: 'Adam Malik', gender: 'ikhwan' as const, whatsapp_number: '6281500000001', active: true },
      { id: 'p-khad', name: 'Khadijah Maryam', gender: 'akhwat' as const, whatsapp_number: '6281500000002', active: true },
      { id: 'p-mf1', name: 'Muhammad Fauzi', gender: 'ikhwan' as const, whatsapp_number: '6281500000003', active: true },
      { id: 'p-mf2', name: 'Fauzi Muhammad Ali', gender: 'ikhwan' as const, whatsapp_number: '6281500000004', active: true },
      { id: 'p-mati', name: 'Umar Said', gender: 'ikhwan' as const, whatsapp_number: '6281500000005', active: false },
    ];
    check('gelar dibuang', namaPengajarNormal('Ustadzah  Khadijah Maryam') === 'khadijah maryam');
    check('cocok lewat WA', cocokkanPengajar({ nama: 'siapa saja', wa: '81500000001', gender: 'ikhwan' }, daftar).pengajar_id === 'p-adam');
    check('WA tanpa akun tidak jatuh ke nama', cocokkanPengajar({ nama: 'Adam Malik', wa: '89999999999', gender: 'ikhwan' }, daftar).status === 'tanpa_akun');
    check('WA milik akun bergender lain', cocokkanPengajar({ nama: 'x', wa: '81500000002', gender: 'ikhwan' }, daftar).status === 'gender_beda');
    check('nama persis setelah gelar dibuang', cocokkanPengajar({ nama: 'Ustadzah Khadijah Maryam', wa: null, gender: 'akhwat' }, daftar).pengajar_id === 'p-khad');
    const panjang = cocokkanPengajar({ nama: 'Adam Malik Nurzuhdi Al Suyudi', wa: null, gender: 'ikhwan' }, daftar);
    check('nama panjang cocok lewat dua kata', panjang.pengajar_id === 'p-adam' && panjang.cara === 'nama', JSON.stringify(panjang));
    check('dua kandidat → nama_ganda', cocokkanPengajar({ nama: 'Fauzi Muhammad', wa: null, gender: 'ikhwan' }, daftar).status === 'nama_ganda');
    check('akun nonaktif tidak dipakai', cocokkanPengajar({ nama: 'Umar Said', wa: null, gender: 'ikhwan' }, daftar).status === 'nama_tak_ketemu');
    check('pilihan manual dipakai', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'akhwat' }, daftar, 'p-khad').cara === 'manual');
    check('pilihan manual beda gender ditolak', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'ikhwan' }, daftar, 'p-khad').pengajar_id === null);
    check('pilihan lewati', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'akhwat' }, daftar, 'lewati').status === 'dilewati');
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('UJI GAGAL DIJALANKAN', e);
  process.exit(1);
});
