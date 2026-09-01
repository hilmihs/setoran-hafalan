// Pecah migrasi Ketersediaan Mengajar HITS menjadi statement satuan yang aman
// dijalankan lewat /api/admin/db. Jalankan: npm run emit-ketersediaan-sql
//
// Kenapa dipecah: endpoint admin membungkus transaksinya sendiri, dan statement
// berat pernah membuat prod 502 lalu seluruhnya rollback — jadi `begin;`/`commit;`
// milik berkas dibuang dan tiap statement dikirim sendiri-sendiri.
//
// Skrip ini hanya MENCETAK. Ia tidak menyentuh basis data mana pun; menjalankan
// DDL ke produksi tetap keputusan dan tindakan manusia.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BERKAS = [
  '0063_ketersediaan_inti.sql',
  '0064_ketersediaan_pendaftar.sql',
  '0065_ketersediaan_alokasi.sql',
  '0066_ketersediaan_hilir.sql',
  '0067_ketersediaan_cascade.sql',
  '0070_ketersediaan_pertemuan.sql',
];

/**
 * Pisah per titik koma di luar kutip dan di luar dollar-quoting.
 * Sederhana tetapi cukup: migrasi modul ini tidak memakai fungsi/trigger.
 */
function pecah(sql: string): string[] {
  const keluar: string[] = [];
  let buf = '';
  let dalamKutip: string | null = null;

  const baris = sql.split('\n');
  for (const b of baris) {
    // Buang komentar utuh dan transaksi milik berkas.
    const bersih = b.trimEnd();
    const hanyaKomentar = /^\s*--/.test(bersih);
    const transaksi = /^\s*(begin|commit)\s*;\s*$/i.test(bersih);
    if (hanyaKomentar || transaksi || bersih.trim() === '') continue;

    // Buang komentar `--` di ujung baris. WAJIB: statement nanti diratakan
    // menjadi satu baris, dan komentar yang tersisa akan mengomentari seluruh
    // sisa definisi — tabelnya lahir cacat tanpa galat apa pun.
    let tanpaKomentar = '';
    let kutip: string | null = null;
    for (let i = 0; i < bersih.length; i++) {
      const c = bersih[i];
      if (kutip) {
        tanpaKomentar += c;
        if (c === kutip) kutip = null;
        continue;
      }
      if (c === "'" || c === '"') {
        kutip = c;
        tanpaKomentar += c;
        continue;
      }
      if (c === '-' && bersih[i + 1] === '-') break;
      tanpaKomentar += c;
    }
    if (!tanpaKomentar.trim()) continue;

    for (const ch of tanpaKomentar) {
      if (dalamKutip) {
        buf += ch;
        if (ch === dalamKutip) dalamKutip = null;
        continue;
      }
      if (ch === "'" || ch === '"') {
        dalamKutip = ch;
        buf += ch;
        continue;
      }
      if (ch === ';') {
        const s = buf.trim();
        if (s) keluar.push(s + ';');
        buf = '';
        continue;
      }
      buf += ch;
    }
    buf += '\n';
  }
  const sisa = buf.trim();
  if (sisa) keluar.push(sisa.endsWith(';') ? sisa : sisa + ';');
  return keluar;
}

const akar = join(process.cwd(), 'supabase', 'migrations');
let nomor = 0;

console.log('# Statement DDL Ketersediaan Mengajar HITS untuk produksi');
console.log('#');
console.log('# Jalankan BERURUTAN. Tiap statement terpisah — jangan digabung, karena');
console.log('# statement berat pernah membuat /api/admin/db 502 lalu rollback semuanya.');
console.log('#');
console.log('# Lewat CLI:   npm run db -- --confirm "<statement>"');
console.log('# Atau tempel satu per satu di /admin/db.');
console.log('#');
console.log('# Urutan wajib: tabel dulu, indeks menyusul. 0067 mengubah foreign key');
console.log('# yang dibuat 0065, jadi ia tidak boleh mendahuluinya.');
console.log('');

for (const berkas of BERKAS) {
  const isi = readFileSync(join(akar, berkas), 'utf8');
  const statement = pecah(isi);
  console.log(`\n## ${berkas} — ${statement.length} statement`);
  for (const s of statement) {
    nomor++;
    const satuBaris = s.replace(/\s+/g, ' ').trim();
    console.log(`\n-- [${String(nomor).padStart(2, '0')}]`);
    console.log(satuBaris);
  }
}

console.log(`\n\n# Total ${nomor} statement.`);
console.log('# Setelah selesai, pastikan dengan:');
console.log(`#   npm run db "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ks_%' ORDER BY 1"`);
console.log('# Harus mengembalikan 16 tabel.');
