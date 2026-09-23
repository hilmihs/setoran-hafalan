/**
 * Tes murni aturan cycle 2in1 — dua era: 2-pekan sampai 27 Sep 2026, lalu
 * bulanan 28 → 27. Tidak menyentuh basis data.
 *
 * Nilai di sini harus sama persis dengan fungsi SQL `cycle_start_of()`
 * (migrasi 0086). Kalau salah satu diubah, yang lain ikut.
 */
import {
  cycleStartOf,
  cycleEndOf,
  nextCycleStart,
  prevCycleStart,
  cyclesInMonth,
  formatCycleRange,
  formatCycleDeadline,
  isValidCycleStart,
  currentCycleStart,
  MONTHLY_SWITCH,
} from '@/lib/week';

let gagal = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}\n  dapat:  ${a}\n  harap:  ${e}`);
    gagal++;
  } else {
    console.log(`ok   ${label}`);
  }
}
const pada = (iso: string) => new Date(`${iso}T03:00:00Z`); // pagi WIB

console.log('# era 2-pekan (tidak boleh berubah)');
eq(cycleStartOf(pada('2026-06-01')), '2026-06-01', 'anchor');
eq(cycleStartOf(pada('2026-06-14')), '2026-06-01', 'hari terakhir cycle pertama');
eq(cycleStartOf(pada('2026-06-15')), '2026-06-15', 'cycle kedua');
eq(cycleStartOf(pada('2026-09-07')), '2026-09-07', 'cycle 7 Sep');
eq(cycleStartOf(pada('2026-09-20')), '2026-09-07', '20 Sep masih cycle 7 Sep');
eq(cycleEndOf('2026-06-01'), '2026-06-14', 'akhir cycle 2-pekan');

console.log('\n# cycle terakhir era lama terpotong');
eq(cycleStartOf(pada('2026-09-21')), '2026-09-21', '21 Sep awal cycle');
eq(cycleStartOf(pada('2026-09-27')), '2026-09-21', '27 Sep masih cycle lama');
eq(cycleEndOf('2026-09-21'), '2026-09-27', 'cycle 21 Sep berhenti 27 Sep, bukan 4 Okt');

console.log('\n# era bulanan');
eq(MONTHLY_SWITCH, '2026-09-28', 'tanggal pergantian');
eq(cycleStartOf(pada('2026-09-28')), '2026-09-28', 'cycle bulanan pertama');
eq(cycleStartOf(pada('2026-10-27')), '2026-09-28', '27 Okt masih cycle September');
eq(cycleStartOf(pada('2026-10-28')), '2026-10-28', '28 Okt cycle baru');
eq(cycleStartOf(pada('2027-01-15')), '2026-12-28', 'lintas tahun');
eq(cycleEndOf('2026-09-28'), '2026-10-27', 'akhir cycle bulanan');
eq(cycleEndOf('2026-12-28'), '2027-01-27', 'akhir cycle lintas tahun');

console.log('\n# maju-mundur antar era');
eq(nextCycleStart('2026-09-07'), '2026-09-21', 'maju di era lama');
eq(nextCycleStart('2026-09-21'), '2026-09-28', 'maju menyeberang ke era bulanan');
eq(nextCycleStart('2026-09-28'), '2026-10-28', 'maju di era bulanan');
eq(prevCycleStart('2026-09-28'), '2026-09-21', 'mundur menyeberang ke era lama');
eq(prevCycleStart('2026-10-28'), '2026-09-28', 'mundur di era bulanan');
eq(prevCycleStart('2026-09-21'), '2026-09-07', 'mundur di era lama');

console.log('\n# cycle per bulan (jumlahnya tidak tetap)');
eq(cyclesInMonth(2026, 6), ['2026-06-01', '2026-06-15'], 'Juni: dua cycle');
eq(cyclesInMonth(2026, 9), ['2026-08-24', '2026-09-07', '2026-09-21'], 'September: tiga, bulan pergantian');
eq(cyclesInMonth(2026, 10), ['2026-09-28'], 'Oktober: satu');
eq(cyclesInMonth(2026, 11), ['2026-10-28'], 'November: satu');

console.log('\n# label');
eq(formatCycleRange('2026-09-28'), '28 September – 27 Oktober 2026', 'rentang bulanan');
eq(formatCycleRange('2026-06-01'), '1 – 14 Juni 2026', 'rentang 2-pekan sebulan');
eq(formatCycleDeadline('2026-06-01'), 'Ahad, 14 Juni 2026', 'deadline 2-pekan tetap Ahad');
eq(formatCycleDeadline('2026-09-28'), 'Selasa, 27 Oktober 2026', 'deadline bulanan pakai hari sebenarnya');

console.log('\n# validasi backfill');
// Backfill tidak boleh menjangkau cycle yang belum berjalan; 2026-09-28 baru
// sah setelah tanggal itu lewat.
eq(isValidCycleStart('2026-09-28'), '2026-09-28' <= currentCycleStart(), 'cycle bulanan pertama: sah hanya setelah berjalan');
eq(isValidCycleStart(currentCycleStart()), true, 'cycle berjalan selalu sah');
eq(isValidCycleStart('2026-10-01'), false, 'tengah cycle ditolak');
eq(isValidCycleStart('2026-09-21'), true, 'awal cycle lama sah');

console.log(gagal === 0 ? '\nSEMUA LULUS' : `\n${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
