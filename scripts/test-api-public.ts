/**
 * test-api-public.ts — uji jalur API publik, luring. Jalankan: npm run test-api
 */
import { sanitize } from '../src/lib/api-public/sanitize';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

function testSanitize() {
  console.log('sanitize:');
  // buang kunci terlarang snake & camel, di kedalaman berapa pun
  const dirty = {
    id: '1', name: 'A', whatsapp_number: '628x', whatsappNumber: '628y',
    nested: { ketua_wa: 'z', ketuaWa: 'z', password_hash: 'h', ok: 1 },
    list: [{ magic_token: 't', keep: 2 }],
  };
  const clean = sanitize(dirty) as any;
  check('drop whatsapp_number', clean.whatsapp_number === undefined);
  check('drop whatsappNumber', clean.whatsappNumber === undefined);
  check('drop nested ketua_wa/ketuaWa', clean.nested.ketuaWa === undefined && clean.nested.ketua_wa === undefined);
  check('drop nested password_hash', clean.nested.password_hash === undefined);
  check('keep nested ok', clean.nested.ok === 1);
  check('drop magic_token in array', clean.list[0].magic_token === undefined);
  check('keep array sibling', clean.list[0].keep === 2);
  check('keep name/id', clean.id === '1' && clean.name === 'A');

  // Map → object
  const m = new Map<string, number>([['a', 1], ['b', 2]]);
  const mo = sanitize({ byPengajar: m }) as any;
  check('Map→object', mo.byPengajar.a === 1 && mo.byPengajar.b === 2 && !(mo.byPengajar instanceof Map));

  // catatan/keterangan NOT stripped, WA on same object IS stripped
  const att = { keterangan: 'demam', catatan: 'ibu sakit', whatsappNumber: '628', name: 'B' };
  const a2 = sanitize(att) as any;
  check('keep keterangan', a2.keterangan === 'demam');
  check('keep catatan', a2.catatan === 'ibu sakit');
  check('still drop whatsappNumber next to catatan', a2.whatsappNumber === undefined);
}

async function main() {
  testSanitize();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
