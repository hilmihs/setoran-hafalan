// Uji fungsi murni sinkron hilmihs: map response → mirror-shape, dan diff.
// Jalankan: npm run test-hilmihs
import {
  konvGender, pengajarId, prefixId, normalizeWaOrNull,
  mapPengajar, mapHalaqah, mapPeserta, mapBatch,
} from '@/lib/hilmihs/map';
import { diffEntity } from '@/lib/hilmihs/diff';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

eq(konvGender(1), 'ikhwan', 'gender 1');
eq(konvGender(2), 'akhwat', 'gender 2');
eq(prefixId('hits-regular', 54), 'hits-regular:54', 'prefix id');
eq(normalizeWaOrNull('81331732974'), '6281331732974', 'wa normal');
eq(normalizeWaOrNull(null), null, 'wa null');
eq(pengajarId('6281331732974', 'hits-regular', 'Fulan'), 'wa:6281331732974', 'pengajar id by wa');
eq(pengajarId(null, 'hits-regular', 'Fulan'), 'nm:hits-regular:Fulan', 'pengajar id by nama');

eq(
  mapBatch({ slug: 'hits-regular', name: 'HITS Reguler', dataSourceType: 'tilawah_api', syncPaused: false, batch: null }),
  { id: 'hits-regular', nama: 'HITS Reguler', aktif: true },
  'mapBatch'
);
eq(
  mapPengajar('hits-regular', { pengajar: 'Abdul Hakim', phone: '81331732974', genders: [1] }),
  { id: 'wa:6281331732974', nama: 'Abdul Hakim', gender: 'ikhwan', whatsapp: '6281331732974' },
  'mapPengajar'
);
eq(
  mapHalaqah('hits-regular', { halaqahId: 54, name: 'HITS 006', pengajar: 'Abdul Hakim', guruPhone: '81331732974', level: 'HITS Lanjutan', gender: 1, type: 'online' }),
  { id: 'hits-regular:54', nama: 'HITS 006', gender: 'ikhwan', level: 'HITS Lanjutan', pengajar_id: 'wa:6281331732974', batch_id: 'hits-regular', mustawa: null, ambang_ujian: 70 },
  'mapHalaqah'
);
eq(
  mapPeserta('hits-regular', { tilawahUserId: 101, name: 'A Devy', userCode: 'M2453153', gender: 2, halaqahId: 55, halaqahName: 'HITS 007', pengajar: 'Risa' }, 3),
  { id: 'hits-regular:101', nama: 'A Devy', gender: 'akhwat', halaqah_id: 'hits-regular:55', is_ketua: false, aktif: true, urutan: 3 },
  'mapPeserta'
);
eq(
  mapHalaqah('dpq', { halaqahId: 9, name: 'X', pengajar: null, guruPhone: null, level: null, gender: 2, type: null }).pengajar_id,
  null, 'halaqah guruPhone null → pengajar_id null'
);
// gender halaqah utamakan nama (source dpq kirim gender=1 utk "DPQ AKHWAT")
eq(mapHalaqah('dpq', { halaqahId: 181, name: 'DPQ AKHWAT 01', pengajar: null, guruPhone: null, level: null, gender: 1, type: null }).gender,
   'akhwat', 'halaqah gender dari nama AKHWAT (override source)');
eq(mapHalaqah('dpq', { halaqahId: 180, name: 'DPQ IKHWAN 01', pengajar: null, guruPhone: null, level: null, gender: 2, type: null }).gender,
   'ikhwan', 'halaqah gender dari nama IKHWAN (override source)');
eq(mapHalaqah('x', { halaqahId: 1, name: 'HITS 006', pengajar: null, guruPhone: null, level: null, gender: 2, type: null }).gender,
   'akhwat', 'halaqah gender fallback ke source bila nama tak sebut gender');

// ── diff ──
// current mirror: 1 pengajar (butuh update nama), 1 hilang (deactivate)
const cur = [
  { id: 'wa:628111', nama: 'Lama', gender: 'ikhwan', whatsapp: '628111', aktif: true },
  { id: 'wa:628999', nama: 'Hilang', gender: 'ikhwan', whatsapp: '628999', aktif: true },
];
const fetched = [
  { id: 'wa:628111', nama: 'Baru', gender: 'ikhwan', whatsapp: '628111' }, // update
  { id: 'wa:628222', nama: 'Fresh', gender: 'ikhwan', whatsapp: '628222' }, // create
];
const d = diffEntity('pengajar', fetched, cur, ['nama', 'gender', 'whatsapp']);
eq(d.map((x) => `${x.op}:${x.entity_id}`).sort(),
   ['create:wa:628222', 'deactivate:wa:628999', 'update:wa:628111'],
   'diff ops');
const upd = d.find((x) => x.op === 'update')!;
eq([upd.before?.nama, upd.after?.nama], ['Lama', 'Baru'], 'diff before/after');
// tak ada perubahan → tak ada baris
eq(diffEntity('pengajar', [{ id: 'wa:628111', nama: 'Baru', gender: 'ikhwan', whatsapp: '628111' }],
     [{ id: 'wa:628111', nama: 'Baru', gender: 'ikhwan', whatsapp: '628111', aktif: true }],
     ['nama', 'gender', 'whatsapp']).length, 0, 'diff no-op');

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll hilmihs tests passed.');
