// Uji fungsi murni presensi Kajian Adab. Jalankan: npm run test-kajian
import {
  sundaysInRange, deriveTerlambat, statusOnCheckin, deriveKajianState,
  computeKajianRekap, type KajianRow, KAJIAN_GHOSTING_DAYS,
} from '@/lib/hits-kajian';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- sundaysInRange --- (2026-01-04 & -11 & -18 & -25 = Minggu)
eq(sundaysInRange('2026-01-01', '2026-01-31'),
   ['2026-01-04','2026-01-11','2026-01-18','2026-01-25'], 'sundays Jan 2026');
eq(sundaysInRange('2026-01-05', '2026-01-05'), [], 'range Senin saja -> []');
eq(sundaysInRange('2026-01-04', '2026-01-04'), ['2026-01-04'], 'range Minggu tunggal');

// --- deriveTerlambat --- (16:00 WIB batas)
eq(deriveTerlambat('2026-01-04T08:30:00.000Z', '2026-01-04'), false, '15:30 WIB -> tepat waktu');
eq(deriveTerlambat('2026-01-04T09:00:00.000Z', '2026-01-04'), false, '16:00 WIB pas -> tidak terlambat');
eq(deriveTerlambat('2026-01-04T09:30:00.000Z', '2026-01-04'), true, '16:30 WIB -> terlambat');

// --- statusOnCheckin ---
eq(statusOnCheckin('Hadir', '2026-01-04T08:00:00.000Z', '2026-01-04'), 'Hadir', 'hadir tepat -> Hadir');
eq(statusOnCheckin('Hadir', '2026-01-04T10:00:00.000Z', '2026-01-04'), 'Terlambat', 'hadir telat -> Terlambat');
eq(statusOnCheckin('Izin', '2026-01-04T10:00:00.000Z', '2026-01-04'), 'Izin', 'izin -> Izin (waktu diabaikan)');

// --- deriveKajianState ---
const NOW = '2026-01-08T12:00:00.000Z';   // Kamis
const R = (o: Partial<KajianRow>): KajianRow =>
  ({ ketua_wa: 'w', tanggal: '2026-01-04', status: null, checkin_at: null, reminder_sent_at: null, ...o });
eq(deriveKajianState(null, '2026-01-11', '2026-01-08', NOW), 'akan-datang', 'sesi masa depan -> akan-datang');
eq(deriveKajianState(R({ status: 'Hadir' }), '2026-01-04', '2026-01-08', NOW), 'hadir', 'status Hadir -> hadir');
eq(deriveKajianState(R({ status: 'Terlambat' }), '2026-01-04', '2026-01-08', NOW), 'terlambat', 'status Terlambat');
eq(deriveKajianState(R({ status: 'Izin' }), '2026-01-04', '2026-01-08', NOW), 'izin', 'status Izin');
eq(deriveKajianState(R({ status: 'Alpa' }), '2026-01-04', '2026-01-08', NOW), 'alpa', 'status Alpa (historis)');
eq(deriveKajianState(null, '2026-01-04', '2026-01-08', NOW), 'belum-isi', 'lewat, tanpa baris & reminder -> belum-isi');
eq(deriveKajianState(R({ reminder_sent_at: '2026-01-07T00:00:00.000Z' }), '2026-01-04', '2026-01-08', NOW),
   'belum-isi', 'direminder, countdown blm habis -> belum-isi');
eq(deriveKajianState(R({ reminder_sent_at: '2026-01-04T00:00:00.000Z' }), '2026-01-04', '2026-01-08', NOW),
   'alpa', 'direminder >3 hari lalu, tak respons -> alpa');

// --- computeKajianRekap ---
const libur = new Set(['2026-01-11']);
const rows: KajianRow[] = [
  R({ tanggal: '2026-01-04', status: 'Hadir' }),
  R({ tanggal: '2026-01-18', status: 'Terlambat' }),
  R({ tanggal: '2026-01-25', status: 'Izin' }),
];
const rek = computeKajianRekap(rows, libur, ['w'], '2026-01-04', '2026-01-25', '2026-01-26T00:00:00.000Z');
eq(rek[0], { ketua_wa: 'w', hadir: 1, terlambat: 1, izin: 1, sakit: 0, alpa: 0, belumIsi: 0, totalSesi: 3, persen: 67 },
   'rekap: libur dikecualikan, persen=(1+1)/3=67');

eq(KAJIAN_GHOSTING_DAYS, 3, 'konstanta countdown 3 hari');

if (failed > 0) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test kajian lulus.');
