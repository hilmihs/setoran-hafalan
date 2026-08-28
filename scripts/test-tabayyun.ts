// Uji fungsi murni state tabayyun. Jalankan: npm run test-tabayyun
import {
  tabayyunGhostingState,
  tabayyunHoursLeft,
  deadlineFromReminder,
  TABAYYUN_DEADLINE_HOURS,
  validateKlaimMenit,
  capBayarDisetujui,
} from '@/lib/hits-tabayyun';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

const NOW = '2026-07-06T12:00:00.000Z';
const T = (over: Partial<{ status: string; reminder_sent_at: string | null; deadline_at: string | null }>) =>
  ({ status: 'pending', reminder_sent_at: null, deadline_at: null, ...over });

// --- tabayyunGhostingState ---
eq(tabayyunGhostingState(T({}), NOW), 'not_reminded', 'pending + belum reminder -> not_reminded');
eq(tabayyunGhostingState(T({ reminder_sent_at: '2026-07-06T10:00:00.000Z', deadline_at: '2026-07-09T10:00:00.000Z' }), NOW),
   'awaiting_within', 'diingatkan, now < deadline -> awaiting_within');
eq(tabayyunGhostingState(T({ reminder_sent_at: '2026-07-03T10:00:00.000Z', deadline_at: '2026-07-06T10:00:00.000Z' }), NOW),
   'ghosting', 'diingatkan, now > deadline -> ghosting');
eq(tabayyunGhostingState(T({ reminder_sent_at: '2026-07-03T12:00:00.000Z', deadline_at: '2026-07-06T12:00:00.000Z' }), NOW),
   'ghosting', 'now == deadline -> ghosting (>=)');
eq(tabayyunGhostingState(T({ status: 'awaiting_reason', reminder_sent_at: '2026-07-01T00:00:00.000Z', deadline_at: '2026-07-04T00:00:00.000Z' }), NOW),
   'has_reason', 'alasan masuk walau lewat deadline -> has_reason (BUKAN ghosting)');
eq(tabayyunGhostingState(T({ status: 'decided' }), NOW), 'decided', 'decided -> decided');

// --- tabayyunHoursLeft ---
eq(tabayyunHoursLeft(T({}), NOW), null, 'belum reminder -> hoursLeft null');
eq(tabayyunHoursLeft(T({ reminder_sent_at: '2026-07-06T00:00:00.000Z', deadline_at: '2026-07-06T18:00:00.000Z' }), NOW),
   6, 'deadline 6 jam lagi -> 6');
eq(tabayyunHoursLeft(T({ reminder_sent_at: '2026-07-03T00:00:00.000Z', deadline_at: '2026-07-06T06:00:00.000Z' }), NOW),
   -6, 'lewat 6 jam -> -6');

// --- deadlineFromReminder ---
eq(deadlineFromReminder('2026-07-06T12:00:00.000Z'), '2026-07-09T12:00:00.000Z', 'reminder + 72h');
eq(TABAYYUN_DEADLINE_HOURS, 72, 'konstanta 72 jam');

// --- validateKlaimMenit ---
eq(validateKlaimMenit('30', 90), { menit: 30 }, 'klaim 30 dari saldo 90 -> valid');
eq(validateKlaimMenit('0', 90), { menit: 0 }, 'klaim 0 valid (= belum menunaikan)');
eq(validateKlaimMenit('90', 90), { menit: 90 }, 'klaim == saldo -> valid');
eq(validateKlaimMenit('91', 90), { error: 'Menit yang ditunaikan tidak boleh melebihi sisa hutang (90 menit).' },
   'klaim > saldo -> ditolak');
eq(validateKlaimMenit('-1', 90), { error: 'Menit tidak boleh negatif.' }, 'klaim negatif -> ditolak');
eq(validateKlaimMenit('', 90), { error: 'Jumlah menit wajib diisi.' }, 'kosong padahal ada saldo -> ditolak');
eq(validateKlaimMenit('abc', 90), { error: 'Jumlah menit harus berupa angka.' }, 'bukan angka -> ditolak');
eq(validateKlaimMenit('12.5', 90), { error: 'Jumlah menit harus bilangan bulat.' }, 'pecahan -> ditolak');
eq(validateKlaimMenit('30', 0), { menit: 0 }, 'saldo 0 -> input diabaikan, hasil 0');

// --- capBayarDisetujui ---
eq(capBayarDisetujui(30, 90), 30, 'disetujui < saldo -> apa adanya');
eq(capBayarDisetujui(120, 90), 90, 'disetujui > saldo -> di-cap ke saldo');
eq(capBayarDisetujui(0, 90), 0, 'disetujui 0 -> 0');
eq(capBayarDisetujui(-5, 90), 0, 'disetujui negatif -> 0');
eq(capBayarDisetujui(30, 0), 0, 'saldo 0 -> 0');

if (failed > 0) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test tabayyun lulus.');
