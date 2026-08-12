/**
 * test-api-public.ts — uji jalur API publik, luring. Jalankan: npm run test-api
 */
import { sanitize } from '../src/lib/api-public/sanitize';
import { generateKey, hashKey, __verifyRow, recordUsage, __drainUsage, __resetAuthCache } from '../src/lib/api-public/auth';

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

function testKeyGen() {
  console.log('key gen:');
  const a = generateKey();
  const b = generateKey();
  check('prefix k_live_', a.raw.startsWith('k_live_'));
  check('raw length >= 40', a.raw.length >= 40);
  check('token_prefix = first 12 of raw', a.tokenPrefix === a.raw.slice(0, 12));
  check('hash matches raw', a.tokenHash === hashKey(a.raw));
  check('two keys differ', a.raw !== b.raw && a.tokenHash !== b.tokenHash);
  check('hash is 64 hex', /^[0-9a-f]{64}$/.test(a.tokenHash));
}

function testVerifyRow() {
  console.log('verify row:');
  const today = '2026-08-12';
  const base = { id: 'x', nama: 'k', scopes: ['maahir'], active: true, expires_at: null as string | null };
  check('valid → ok', __verifyRow({ ...base }, today).ok === true);
  check('active=false → 401', __verifyRow({ ...base, active: false }, today).ok === false);
  check('expires yesterday → 401', __verifyRow({ ...base, expires_at: '2026-08-11' }, today).ok === false);
  check('expires today → ok (inclusive)', __verifyRow({ ...base, expires_at: '2026-08-12' }, today).ok === true);
  check('expires tomorrow → ok', __verifyRow({ ...base, expires_at: '2026-08-13' }, today).ok === true);
}

function testUsageAccrual() {
  console.log('usage accrual:');
  __resetAuthCache();
  recordUsage('idA'); recordUsage('idA'); recordUsage('idB');
  const drained = __drainUsage();
  check('idA counted 2', drained.find(d => d.id === 'idA')?.count === 2);
  check('idB counted 1', drained.find(d => d.id === 'idB')?.count === 1);
  check('drain resets', __drainUsage().length === 0);
}

async function main() {
  testSanitize();
  testKeyGen();
  testVerifyRow();
  testUsageAccrual();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
