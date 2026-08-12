/**
 * test-api-public.ts — uji jalur API publik, luring. Jalankan: npm run test-api
 */
import { sanitize } from '../src/lib/api-public/sanitize';
import { generateKey, hashKey, __verifyRow, recordUsage, __drainUsage, __resetAuthCache } from '../src/lib/api-public/auth';
import { getCached, setCached, __resetCache, checkRateLimit, __resetRate, acquireInflight } from '../src/lib/api-public/cache';
import { etagOf, fail, ok } from '../src/lib/api-public/respond';
import { FORBIDDEN_COLUMNS, auditEntities } from '../src/lib/api-public/registry';
import { parseRequest } from '../src/lib/api-public/query';
import type { EntityDef } from '../src/lib/api-public/types';

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

function testCache() {
  console.log('cache:');
  __resetCache();
  setCached('k1', { a: 1 }, 60);
  const h = getCached('k1');
  check('hit returns value', (h?.value as any)?.a === 1);
  check('hit umur >= 0', typeof h?.umurDetik === 'number');
  check('miss returns null', getCached('nope') === null);
  const big = { s: 'x'.repeat(1_100_000) };
  setCached('big', big, 60);
  check('oversized not cached', getCached('big') === null);
}

function testRate() {
  console.log('rate limit:');
  __resetRate();
  let last = true;
  for (let i = 0; i < 120; i++) last = checkRateLimit('key', 120);
  check('120th allowed', last === true);
  check('121st blocked', checkRateLimit('key', 120) === false);
  check('other key independent', checkRateLimit('key2', 120) === true);
}

async function testInflight() {
  console.log('inflight:');
  let active = 0, maxSeen = 0;
  const job = () => new Promise<void>(res => { active++; maxSeen = Math.max(maxSeen, active); setTimeout(() => { active--; res(); }, 10); });
  const runs = Array.from({ length: 8 }, () => acquireInflight(job, 4, 5000));
  await Promise.all(runs);
  check('never more than 4 concurrent', maxSeen <= 4);
}

function testRespond() {
  console.log('respond:');
  const e1 = etagOf({ a: 1, b: 2 });
  const e2 = etagOf({ a: 1, b: 2 });
  const e3 = etagOf({ a: 1, b: 3 });
  check('same content same etag', e1 === e2);
  check('diff content diff etag', e1 !== e3);
  const f = fail('forbidden_scope', "Key tidak punya scope 'hits'.", 403);
  check('fail status 403', f.status === 403);
  void ok;
}

function testRegistryAudit() {
  console.log('registry audit:');
  check('forbidden includes whatsapp_number', FORBIDDEN_COLUMNS.includes('whatsapp_number'));
  check('forbidden includes password_hash', FORBIDDEN_COLUMNS.includes('password_hash'));
  check('forbidden includes audio_url', FORBIDDEN_COLUMNS.includes('audio_url'));
  check('forbidden includes magic_token', FORBIDDEN_COLUMNS.includes('magic_token'));

  const good: Record<string, EntityDef> = {
    peserta: { route: 'peserta', table: 'peserta', scope: 'maahir', columns: ['id', 'name'], filters: [], order: { column: 'id', dir: 'asc' } },
  };
  let cleanOk = true;
  try { auditEntities(good); } catch { cleanOk = false; }
  check('clean entities pass audit', cleanOk);

  const bad: Record<string, EntityDef> = {
    peserta: { route: 'peserta', table: 'peserta', scope: 'maahir', columns: ['id', 'whatsapp_number'], filters: [], order: { column: 'id', dir: 'asc' } },
  };
  let threw = false;
  try { auditEntities(bad); } catch { threw = true; }
  check('forbidden column throws', threw);
}

const PESERTA_DEF: EntityDef = {
  route: 'peserta', table: 'peserta', scope: 'maahir',
  columns: ['id', 'name', 'gender', 'active'],
  filters: [
    { param: 'gender', column: 'gender', kind: 'eq' },
    { param: 'active', column: 'active', kind: 'bool' },
  ],
  order: { column: 'created_at', dir: 'desc' },
};
const PERTEMUAN_DEF: EntityDef = {
  route: 'pertemuan', table: 'pertemuan_program', scope: 'maahir',
  columns: ['id', 'tanggal'],
  filters: [
    { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
    { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
  ],
  order: { column: 'tanggal', dir: 'desc' },
};
function sp(q: string) { return new URLSearchParams(q); }
function testParse() {
  console.log('parse request:');
  const okr = parseRequest(sp('gender=IKHWAN&active=true&page=2&limit=50'), PESERTA_DEF);
  check('valid parses', okr.ok === true);
  if (okr.ok) {
    check('page 2', okr.page === 2);
    check('limit 50', okr.limit === 50);
    check('gender filter', okr.filters.some(f => f.column === 'gender' && f.value === 'IKHWAN'));
    check('bool coerced', okr.filters.some(f => f.column === 'active' && f.value === true));
  }
  check('unknown param → error', parseRequest(sp('gender=X&bogus=1'), PESERTA_DEF).ok === false);
  check('limit 0 → error', parseRequest(sp('limit=0'), PESERTA_DEF).ok === false);
  check('limit 501 → error', parseRequest(sp('limit=501'), PESERTA_DEF).ok === false);
  check('limit abc → error', parseRequest(sp('limit=abc'), PESERTA_DEF).ok === false);
  const def1 = parseRequest(sp(''), PESERTA_DEF);
  check('default page 1 limit 100', def1.ok && def1.page === 1 && def1.limit === 100);
  check('good date ok', parseRequest(sp('tanggal_dari=2026-08-01'), PERTEMUAN_DEF).ok === true);
  check('bad date 2026-8-1 → error', parseRequest(sp('tanggal_dari=2026-8-1'), PERTEMUAN_DEF).ok === false);
}

async function main() {
  testParse();
  testSanitize();
  testKeyGen();
  testVerifyRow();
  testUsageAccrual();
  testCache();
  testRate();
  await testInflight();
  testRespond();
  testRegistryAudit();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
