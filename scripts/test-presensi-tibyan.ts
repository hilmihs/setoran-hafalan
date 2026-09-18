// Uji murni expectedDaysInRange terhadap kolom program_kelas.ikut_tibyan.
// Jalankan: npm run test-presensi-tibyan
// Lib menarik session.ts yang menuntut SESSION_SECRET saat impor; uji ini
// murni (tanpa DB/sesi), jadi cukup nilai dummy sebelum impor dinamis.
process.env.SESSION_SECRET ??= 'x'.repeat(48);
import type { ProgramKelasRow } from '@/lib/program-kelas';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

function kelas(over: Partial<ProgramKelasRow>): ProgramKelasRow {
  return {
    id: 'k1',
    name: 'Uji',
    gender: 'akhwat',
    jadwal_hari: ['Senin'],
    waktu_mulai: '09:00:00',
    waktu_selesai: '11:30:00',
    ketua_wa: null,
    wakil_wa: null,
    self_attendance: false,
    presensi_sifat: 'harian',
    mulai_tanggal: null,
    ikut_tibyan: true,
    ...over,
  };
}

// Senin 14 Sep 2026 s/d Ahad 27 Sep 2026: 2 Senin, 2 Sabtu (19 & 26).
const DARI = '2026-09-14';
const SAMPAI = '2026-09-27';

async function main() {
  const { expectedDaysInRange } = await import('@/lib/maahir-presensi');

  console.log('kelas harian default (ikut_tibyan=true)');
  {
    const d = expectedDaysInRange(kelas({}), DARI, SAMPAI);
    const maahir = d.filter((x) => x.program === 'kelas_maahir').map((x) => x.tanggal);
    const tibyan = d.filter((x) => x.program === 'at_tibyan').map((x) => x.tanggal);
    check('2 sesi kelas_maahir (Senin 14 & 21)', maahir.join(',') === '2026-09-14,2026-09-21', maahir.join(','));
    check('2 sesi at_tibyan (Sabtu 19 & 26)', tibyan.join(',') === '2026-09-19,2026-09-26', tibyan.join(','));
  }

  console.log('kelas harian ikut_tibyan=false');
  {
    const d = expectedDaysInRange(kelas({ ikut_tibyan: false }), DARI, SAMPAI);
    const maahir = d.filter((x) => x.program === 'kelas_maahir').map((x) => x.tanggal);
    const tibyan = d.filter((x) => x.program === 'at_tibyan');
    check('sesi kelas_maahir tetap 2', maahir.join(',') === '2026-09-14,2026-09-21', maahir.join(','));
    check('tak ada sesi at_tibyan', tibyan.length === 0, `dapat ${tibyan.length}`);
  }

  console.log('kelas At-Tibyan gabungan (jadwal_hari kosong, ikut_tibyan=true)');
  {
    const d = expectedDaysInRange(kelas({ jadwal_hari: [] }), DARI, SAMPAI);
    const maahir = d.filter((x) => x.program === 'kelas_maahir');
    const tibyan = d.filter((x) => x.program === 'at_tibyan');
    check('tak ada sesi kelas_maahir', maahir.length === 0, `dapat ${maahir.length}`);
    check('2 sesi at_tibyan', tibyan.length === 2, `dapat ${tibyan.length}`);
    check('jam At-Tibyan 08:30–10:30', tibyan.every((x) => x.waktu_mulai === '08:30' && x.waktu_selesai === '10:30'));
  }

  console.log('libur Sabtu 19 Sep tetap dihormati');
  {
    const d = expectedDaysInRange(kelas({ jadwal_hari: [] }), DARI, SAMPAI, new Set(['2026-09-19']));
    const tibyan = d.filter((x) => x.program === 'at_tibyan').map((x) => x.tanggal);
    check('hanya Sabtu 26', tibyan.join(',') === '2026-09-26', tibyan.join(','));
  }

  console.log('mingguan tak tersentuh (tanpa At-Tibyan, apa pun ikut_tibyan)');
  {
    const d = expectedDaysInRange(kelas({ presensi_sifat: 'mingguan', ikut_tibyan: true }), DARI, SAMPAI);
    check('2 slot pekan, semua kelas_maahir', d.length === 2 && d.every((x) => x.program === 'kelas_maahir' && x.mingguan));
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
