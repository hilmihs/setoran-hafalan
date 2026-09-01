/**
 * export-majelis.ts — daftar nama peserta & pengajar Maahir untuk dashboard
 * Majelis Pendidikan, satu periode laporan per jalan.
 *
 * Konsumen mendedup ORANG lintas program, jadi yang dikirim daftar nama —
 * bukan agregat. Satu baris per orang per kelas per program.
 *
 *   npm run export-majelis                # periode terakhir yang sudah tutup
 *   npm run export-majelis -- 2026-07     # 28 Jun 2026 s/d 27 Jul 2026
 *
 * Sumber data = PRODUKSI, lewat endpoint SQL admin (READ ONLY, sama seperti
 * `npm run db`). DATABASE_URL di .env.local menunjuk Postgres lokal yang isinya
 * beda, jadi jangan dipakai untuk ekspor ini.
 *
 * Env (.env.local): ADMIN_API_TOKEN, ADMIN_API_URL (fallback NEXT_PUBLIC_APP_URL)
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { periodeStartDate, periodeEndDate, periodeBerjalan } from '../src/lib/periode-laporan';

// ---------------------------------------------------------------- konstanta

/**
 * Salinan `isTakhassusKelas` dari src/lib/program-kelas.ts. Modul aslinya
 * menarik `supabaseAdmin` + `next/headers` yang tak bisa hidup di skrip tsx,
 * dan cuma dua nama ini yang dibutuhkan. Kalau nama kelasnya berubah di DB,
 * ubah di kedua tempat.
 */
const TAKHASSUS_NAMES = new Set(['Maahir Takhassus Ikhwan', 'Maahir Takhassus Akhwat']);
const isTakhassusKelas = (name: string) => TAKHASSUS_NAMES.has(name);

const PROGRAM_TAKHASSUS = 'Maahir Takhassus';
const PROGRAM_NON_TAKHASSUS = 'Maahir Non-Takhassus';
const PROGRAM_TIBYAN = 'Maahir At-Tibyan';

/** Status kehadiran yang dihitung hadir. Terlambat = tetap datang. */
const STATUS_HADIR = new Set(['hadir', 'terlambat']);

/**
 * Pengajar Maahir — DITULIS TANGAN, bukan hasil query.
 *
 * Tidak ada satu pun tabel yang menghubungkan pengajar dengan kelas Maahir:
 * `program_kelas` tak punya kolomnya, `kelas_hits` (satu-satunya tabel dengan
 * `pengajar_id`) kosong 0 baris, dan laporan bulanan yang ada memakai konstanta
 * `kehadiranPengajar: 100` — bukan data. Daftar ini datang dari koordinator
 * (1 Sep 2026); WA-nya dicocokkan ke `syaikh` / `eval_pengajar` / `pengajar`.
 *
 * Kolom `program` sengaja hanya diisi untuk yang sudah dipastikan mengajar
 * kelas 6A–6D. Untuk syaikh/syaikhah belum ada keterangan programnya, dan
 * menebak lebih buruk daripada mengosongkan.
 */
type GuruManual = {
  nama: string;
  gender: 'L' | 'P';
  wa: string | null;
  program: string; // '' = belum dipastikan
  sumber: string;
};

const GURU_MAAHIR: GuruManual[] = [
  { nama: 'Nur Hanifah Rasmani', gender: 'P', wa: '6285368377317', program: PROGRAM_NON_TAKHASSUS, sumber: 'eval_pengajar (CMS tilawah)' },
  { nama: 'Radiatam Mardhiyah', gender: 'P', wa: '6281261306563', program: PROGRAM_NON_TAKHASSUS, sumber: 'syaikh + eval_pengajar' },
  { nama: 'Salma', gender: 'P', wa: '6282136573097', program: PROGRAM_NON_TAKHASSUS, sumber: 'syaikh' },
  { nama: 'Ruqayyah', gender: 'P', wa: '6289653402400', program: PROGRAM_NON_TAKHASSUS, sumber: 'eval_pengajar + pengajar' },
  { nama: 'Syaikh Ahmad', gender: 'L', wa: '6282260747373', program: '', sumber: 'syaikh' },
  { nama: 'Ahmad Abdus Syukur', gender: 'L', wa: '6285822950406', program: '', sumber: 'syaikh + eval_pengajar' },
  { nama: 'Abdullah Mubarak Al Habsyi', gender: 'L', wa: '6285718965202', program: '', sumber: 'pengajar + eval_pengajar' },
  { nama: 'Syaikhah Syaima', gender: 'P', wa: null, program: '', sumber: 'TIDAK ADA di sistem — nama dari koordinator' },
];

/**
 * Pasangan yang dicurigai satu orang tapi dua akun, ditemukan saat inventaris.
 * Tak digabung sendiri — konsumen yang memutuskan.
 */
const AKUN_GANDA_MANUAL = [
  {
    id_a: '6289653402400',
    id_b: '6281568366175',
    nama: 'Ruqayyah',
    alasan:
      'Dua baris eval_pengajar bernama persis "Ruqayyah" dengan WA berbeda. ' +
      '6289653402400 punya 3 halaqah + baris pengajar + keanggotaan kelas Maahir; ' +
      '6281568366175 tak punya keterkaitan apa pun. Yang dipakai di ekspor: 6289653402400.',
  },
];

// ------------------------------------------------------------- akses ke prod

type SqlRow = Record<string, unknown>;

function adminConfig(): { base: string; token: string } {
  const token = process.env.ADMIN_API_TOKEN;
  const base = (process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!token) throw new Error('ADMIN_API_TOKEN belum di-set di .env.local');
  if (!base) throw new Error('ADMIN_API_URL / NEXT_PUBLIC_APP_URL belum di-set di .env.local');
  return { base, token };
}

/**
 * SELECT ke prod. Prod sering lambat merespons dan `fetch` node menyerah di
 * ~10 detik fase connect, jadi tiap query dicoba ulang beberapa kali.
 *
 * Endpoint memotong hasil READ di 1000 baris. Semua query di bawah sudah
 * diagregasi supaya jauh di bawah batas itu; kalau `truncated` tetap true,
 * skrip berhenti daripada mengirim daftar yang bolong diam-diam.
 */
async function sql(query: string, label: string): Promise<SqlRow[]> {
  const { base, token } = adminConfig();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${base}/api/admin/db`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ sql: query, confirm: false }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: SqlRow[];
        truncated?: boolean;
      };
      if (!data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.truncated) throw new Error(`hasil "${label}" dipotong di 1000 baris — query harus diagregasi`);
      return data.rows ?? [];
    } catch (err) {
      lastErr = err;
      if (String(err).includes('dipotong di 1000 baris')) throw err;
      if (attempt < 5) {
        console.warn(`  · ${label}: percobaan ${attempt} gagal (${String(err)}), ulangi…`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw new Error(`Query "${label}" gagal setelah 5 percobaan: ${String(lastErr)}`);
}

// -------------------------------------------------------------------- tipe

type Baris = {
  nama: string;
  peran: 'peserta' | 'pengajar';
  id_orang: string;
  program: string;
  kelas: string;
  gender: 'L' | 'P' | '';
  email: string;
  no_wa: string;
  status: string;
  jumlah_hadir: number | '';
  sumber: string; // kolom tambahan; konsumen mengabaikannya
};

// -------------------------------------------------------------------- utama

/** Periode terakhir yang sudah tutup (periode berjalan dikurangi satu bulan). */
function periodeTerakhirTutup(): string {
  const [y, m] = periodeBerjalan().split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

async function main() {
  const arg = process.argv[2];
  if (arg && !/^\d{4}-\d{2}$/.test(arg)) {
    console.error('Usage: npm run export-majelis -- [YYYY-MM]');
    process.exit(2);
  }
  const month = arg ?? periodeTerakhirTutup();
  const start = periodeStartDate(month);
  const end = periodeEndDate(month);

  console.log(`Periode laporan ${month}: ${start} s/d ${end}\n`);

  // --- 1. Kelas
  const kelasRows = await sql(
    `select id, name, gender from program_kelas order by gender, name`,
    'kelas'
  );
  const kelasById = new Map(
    kelasRows.map((k) => [
      String(k.id),
      { name: String(k.name), gender: String(k.gender) as 'ikhwan' | 'akhwat' },
    ])
  );

  // --- 2. Anggota yang PERNAH terdaftar dalam jendela laporan.
  // Yang keluar di tengah periode ikut terbawa (status-nya diisi), yang keluar
  // sebelum periode dibuang. `active=false` tetap ikut: konsumen butuh angka
  // "pernah terdaftar", bukan cuma yang bertahan.
  const anggotaRows = await sql(
    `select a.id, a.program_kelas_id, a.name, a.whatsapp_number, a.active,
            a.mulai_tanggal, a.selesai_tanggal, a.created_at::date as created_date
       from program_kelas_anggota a
      where coalesce(a.mulai_tanggal, a.created_at::date) <= '${end}'
        and (a.selesai_tanggal is null or a.selesai_tanggal >= '${start}')
      order by a.name`,
    'anggota'
  );

  // --- 3. Kehadiran, sudah diagregasi per (orang, program) supaya tak kena
  // potongan 1000 baris. Hanya presensi yang benar-benar tersubmit.
  const hadirRows = await sql(
    `select k.anggota_id, p.program,
            count(*) filter (where k.status in ('hadir','terlambat')) as hadir
       from kehadiran_peserta k
       join pertemuan_program p on p.id = k.pertemuan_id
      where p.tanggal between '${start}' and '${end}'
        and k.diisi_at is not null
        and k.anggota_id is not null
      group by 1, 2`,
    'kehadiran'
  );
  const hadirByKey = new Map<string, number>();
  for (const r of hadirRows) {
    hadirByKey.set(`${String(r.anggota_id)}|${String(r.program)}`, Number(r.hadir));
  }

  // --- 4. Kelas mana yang menggelar At-Tibyan di jendela ini.
  // At-Tibyan bukan kelas tersendiri: sesinya (Sabtu) ditempel ke kelas yang
  // sama dengan anggota yang sama, jadi satu orang wajar punya dua baris.
  const tibyanRows = await sql(
    `select distinct program_kelas_id
       from pertemuan_program
      where program = 'at_tibyan' and tanggal between '${start}' and '${end}'`,
    'kelas at-tibyan'
  );
  const kelasAdaTibyan = new Set(tibyanRows.map((r) => String(r.program_kelas_id)));

  // --- 5. Susun baris peserta
  const baris: Baris[] = [];
  for (const a of anggotaRows) {
    const kelas = kelasById.get(String(a.program_kelas_id));
    if (!kelas) continue;
    const wa = a.whatsapp_number ? String(a.whatsapp_number) : '';
    const gender: 'L' | 'P' = kelas.gender === 'ikhwan' ? 'L' : 'P';

    // Alasan keluar tidak ada kolomnya di DB — jadi ditulis apa adanya, bukan
    // dikarang jadi "Mengundurkan diri".
    let status = '';
    if (a.active === false) status = 'Tidak aktif';
    else if (a.selesai_tanggal && String(a.selesai_tanggal) <= end) {
      status = `Selesai per ${String(a.selesai_tanggal)}`;
    }

    const dasar = {
      nama: String(a.name ?? '').trim(),
      peran: 'peserta' as const,
      id_orang: wa,
      kelas: kelas.name,
      gender,
      email: '',
      no_wa: wa,
      status,
      sumber: 'program_kelas_anggota',
    };

    baris.push({
      ...dasar,
      program: isTakhassusKelas(kelas.name) ? PROGRAM_TAKHASSUS : PROGRAM_NON_TAKHASSUS,
      jumlah_hadir: hadirByKey.get(`${String(a.id)}|kelas_maahir`) ?? 0,
    });

    if (kelasAdaTibyan.has(String(a.program_kelas_id))) {
      baris.push({
        ...dasar,
        program: PROGRAM_TIBYAN,
        jumlah_hadir: hadirByKey.get(`${String(a.id)}|at_tibyan`) ?? 0,
      });
    }
  }

  // --- 6. Baris pengajar.
  // `kelas` kosong: peta kelas→guru tak ada di sistem dan koordinator belum
  // memberikannya. `jumlah_hadir` kosong, BUKAN 0 — kehadiran pengajar memang
  // tidak dicatat di mana pun, dan menulis 0 akan terbaca "tak pernah datang".
  for (const g of GURU_MAAHIR) {
    baris.push({
      nama: g.nama,
      peran: 'pengajar',
      id_orang: g.wa ?? '',
      program: g.program,
      kelas: '',
      gender: g.gender,
      email: '',
      no_wa: g.wa ?? '',
      status: '',
      jumlah_hadir: '',
      sumber: g.sumber,
    });
  }

  // --- 7. Dugaan akun ganda: nama sama, WA beda (kandidat orang yang sama).
  const waByNama = new Map<string, Set<string>>();
  for (const a of anggotaRows) {
    const key = String(a.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    const set = waByNama.get(key) ?? new Set<string>();
    if (a.whatsapp_number) set.add(String(a.whatsapp_number));
    waByNama.set(key, set);
  }
  const akunGanda = [...AKUN_GANDA_MANUAL];
  for (const [nama, was] of waByNama) {
    if (was.size < 2) continue;
    const list = [...was];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        akunGanda.push({
          id_a: list[i],
          id_b: list[j],
          nama,
          alasan: 'Nama identik di program_kelas_anggota dengan nomor WA berbeda.',
        });
      }
    }
  }

  await tulisXlsx(month, baris, akunGanda);
  cetakKontrolKualitas(month, start, end, baris, anggotaRows, kelasById, kelasAdaTibyan, akunGanda);
}

// ------------------------------------------------------------------- output

async function tulisXlsx(
  month: string,
  baris: Baris[],
  akunGanda: Array<{ id_a: string; id_b: string; nama: string; alasan: string }>
) {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Daftar');
  ws.columns = [
    { header: 'nama', key: 'nama', width: 32 },
    { header: 'peran', key: 'peran', width: 10 },
    { header: 'id_orang', key: 'id_orang', width: 16 },
    { header: 'program', key: 'program', width: 22 },
    { header: 'kelas', key: 'kelas', width: 30 },
    { header: 'gender', key: 'gender', width: 8 },
    { header: 'email', key: 'email', width: 10 },
    { header: 'no_wa', key: 'no_wa', width: 16 },
    { header: 'status', key: 'status', width: 24 },
    { header: 'jumlah_hadir', key: 'jumlah_hadir', width: 13 },
    { header: 'sumber', key: 'sumber', width: 34 },
  ];
  // WA sebagai teks — Excel akan melahap angka 62xxx jadi notasi ilmiah.
  for (const b of baris) ws.addRow(b);
  ws.getColumn('id_orang').numFmt = '@';
  ws.getColumn('no_wa').numFmt = '@';
  ws.getRow(1).font = { bold: true };

  const wsGanda = wb.addWorksheet('Dugaan_akun_ganda');
  wsGanda.columns = [
    { header: 'id_a', key: 'id_a', width: 16 },
    { header: 'id_b', key: 'id_b', width: 16 },
    { header: 'nama', key: 'nama', width: 32 },
    { header: 'alasan', key: 'alasan', width: 80 },
  ];
  for (const g of akunGanda) wsGanda.addRow(g);
  wsGanda.getColumn('id_a').numFmt = '@';
  wsGanda.getColumn('id_b').numFmt = '@';
  wsGanda.getRow(1).font = { bold: true };

  const dir = path.join(process.cwd(), 'exports');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `majelis-maahir-${month}.xlsx`);
  await wb.xlsx.writeFile(file);
  console.log(`\n✓ ${file}\n`);
}

function cetakKontrolKualitas(
  month: string,
  start: string,
  end: string,
  baris: Baris[],
  anggotaRows: SqlRow[],
  kelasById: Map<string, { name: string; gender: string }>,
  kelasAdaTibyan: Set<string>,
  akunGanda: unknown[]
) {
  const peserta = baris.filter((b) => b.peran === 'peserta');
  const pengajar = baris.filter((b) => b.peran === 'pengajar');
  const unik = (rows: Baris[], f: (b: Baris) => string) =>
    new Set(rows.map(f).filter((v) => v !== '')).size;

  console.log('================ KONTROL KUALITAS ================');
  console.log(`Periode ${month} (${start} s/d ${end})\n`);

  console.log('Baris / id_orang unik / nama unik');
  console.log(`  peserta   : ${peserta.length} baris · ${unik(peserta, (b) => b.id_orang)} id · ${unik(peserta, (b) => b.nama)} nama`);
  console.log(`  pengajar  : ${pengajar.length} baris · ${unik(pengajar, (b) => b.id_orang)} id · ${unik(pengajar, (b) => b.nama)} nama`);
  console.log(`  TOTAL     : ${baris.length} baris · ${unik(baris, (b) => b.id_orang)} id · ${unik(baris, (b) => b.nama)} nama`);

  console.log('\nPecahan per program (baris · orang unik)');
  const programs = [PROGRAM_TAKHASSUS, PROGRAM_NON_TAKHASSUS, PROGRAM_TIBYAN, ''];
  for (const p of programs) {
    const rows = baris.filter((b) => b.program === p);
    if (rows.length === 0) continue;
    const label = p === '' ? '(program belum dipastikan)' : p;
    console.log(`  ${label.padEnd(28)}: ${String(rows.length).padStart(4)} · ${unik(rows, (b) => b.id_orang)} orang`);
  }

  const namaBermasalah = baris.filter((b) => b.nama.trim().length < 3);
  console.log(`\nNama kosong / < 3 huruf : ${namaBermasalah.length}`);
  for (const b of namaBermasalah) console.log(`  ! "${b.nama}" (${b.peran}, ${b.kelas || '—'})`);

  console.log(`Baris peran=pengajar    : ${pengajar.length}${pengajar.length === 0 ? '  ← ADA YANG TERLEWAT' : ''}`);
  console.log(`Dugaan akun ganda       : ${akunGanda.length} pasang`);

  console.log('\nStabilitas id_orang (id_orang = nomor WA ternormalisasi)');
  const idPerNama = new Map<string, Set<string>>();
  const namaPerId = new Map<string, Set<string>>();
  for (const a of anggotaRows) {
    const n = String(a.name ?? '').trim().toLowerCase();
    const w = String(a.whatsapp_number ?? '');
    if (!n || !w) continue;
    (idPerNama.get(n) ?? idPerNama.set(n, new Set()).get(n)!).add(w);
    (namaPerId.get(w) ?? namaPerId.set(w, new Set()).get(w)!).add(n);
  }
  const waBanyakNama = [...namaPerId.values()].filter((s) => s.size > 1).length;
  const namaBanyakWa = [...idPerNama.values()].filter((s) => s.size > 1).length;
  const barisPerWa = new Map<string, number>();
  for (const a of anggotaRows) {
    const w = String(a.whatsapp_number ?? '');
    if (w) barisPerWa.set(w, (barisPerWa.get(w) ?? 0) + 1);
  }
  const waLintasKelas = [...barisPerWa.values()].filter((n) => n > 1).length;
  console.log(`  baris anggota di jendela         : ${anggotaRows.length}`);
  console.log(`  WA unik                          : ${barisPerWa.size}`);
  console.log(`  WA yang punya >1 baris (>1 kelas): ${waLintasKelas}  → program_kelas_anggota.id TIDAK stabil, karena itu tidak dipakai`);
  console.log(`  WA dengan nama berbeda           : ${waBanyakNama}  (0 = satu WA konsisten satu orang)`);
  console.log(`  nama dengan WA berbeda           : ${namaBanyakWa}  (>0 → sudah masuk sheet Dugaan_akun_ganda)`);
  console.log('  → id_orang DIISI karena WA stabil lintas kelas & lintas periode.');

  const tanpaTibyan = [...kelasById.entries()].filter(([id]) => !kelasAdaTibyan.has(id));
  console.log(`\nKelas tanpa sesi At-Tibyan di periode ini: ${tanpaTibyan.length}`);
  for (const [, k] of tanpaTibyan) console.log(`  · ${k.name}`);

  console.log('\nBatasan yang HARUS ikut diberitahukan ke konsumen:');
  console.log('  · email  : tidak ada kolom email di seluruh skema → kosong untuk semua orang.');
  console.log('  · status : DB tak menyimpan alasan keluar. Yang ada hanya "Tidak aktif" (active=false)');
  console.log('             dan "Selesai per <tgl>" (selesai_tanggal). Tak ada yang dikarang jadi');
  console.log('             "Mengundurkan diri".');
  console.log('  · pengajar: peta kelas→guru tidak ada di sistem. Daftar guru ditulis tangan di');
  console.log('             GURU_MAAHIR (scripts/export-majelis.ts), kolom kelas kosong, dan');
  console.log('             jumlah_hadir kosong karena kehadiran pengajar memang tak dicatat.');
  console.log('  · At-Tibyan bukan roster terpisah — sesi Sabtu di kelas yang sama, orang yang sama.');
  console.log('             Satu orang wajar punya 2 baris dengan id_orang identik.');
  console.log('=================================================');
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
