/**
 * Test auto-discover tab presensi (pure, tanpa DB).
 *   npx tsx scripts/test-tab-discovery.ts
 *
 * Membuktikan fix "halaqah baru selalu miss di supabase":
 *  1. newTabsToRegister mengembalikan hanya tab yang gid-nya BELUM terdaftar
 *     (inti auto-discover tiap sync).
 *  2. Dedup gid berulang dalam hasil pubhtml → tak dobel.
 *  3. Semua sudah terdaftar → hasil kosong (idempoten, sync ke-2 no-op).
 *  4. parsePubhtmlTabs mengekstrak {name, gid} dari markup pubhtml.
 */
import { newTabsToRegister, parsePubhtmlTabs, type SheetTab } from '../src/lib/hits-sheets';

let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
}
const gids = (tabs: SheetTab[]) => tabs.map((t) => t.gid).join(',');

// ── Case 1: tab baru ditambah ke sheet, hanya yang baru yang didaftarkan ──
{
  const sheet: SheetTab[] = [
    { name: 'HITS 024 AKHWAT JUNI', gid: '10' },
    { name: 'HITS 047 AKHWAT JUNI', gid: '20' }, // baru
    { name: 'HITS 035 AKHWAT JUNI', gid: '30' }, // baru
  ];
  const registered = ['10'];
  const neu = newTabsToRegister(sheet, registered);
  check('1. hanya tab baru (gid 20,30)', gids(neu) === '20,30', `dapat=[${gids(neu)}]`);
}

// ── Case 2: pubhtml mengulang gid → dedup ──
{
  const sheet: SheetTab[] = [
    { name: 'A', gid: '5' },
    { name: 'A (dup)', gid: '5' },
    { name: 'B', gid: '6' },
  ];
  const neu = newTabsToRegister(sheet, []);
  check('2. dedup gid berulang', gids(neu) === '5,6', `dapat=[${gids(neu)}]`);
}

// ── Case 3: semua sudah terdaftar → kosong (sync ke-2 idempoten) ──
{
  const sheet: SheetTab[] = [
    { name: 'A', gid: '1' },
    { name: 'B', gid: '2' },
  ];
  const neu = newTabsToRegister(sheet, ['1', '2']);
  check('3. semua terdaftar → kosong', neu.length === 0, `dapat=[${gids(neu)}]`);
}

// ── Case 4: parsePubhtmlTabs ekstrak name+gid ──
{
  const html =
    '<ul><li><a href="https://docs.google.com/x/pubhtml#gid=111">HITS 024 AKHWAT JUNI</a></li>' +
    '<li><a href="#gid=222">HITS 047 &amp; Lain</a></li></ul>';
  const tabs = parsePubhtmlTabs(html);
  check('4a. dua tab terparse', tabs.length === 2, `n=${tabs.length}`);
  check('4b. gid & nama benar', tabs[0].gid === '111' && tabs[0].name === 'HITS 024 AKHWAT JUNI');
  check('4c. entity di-decode', tabs[1].name === 'HITS 047 & Lain' && tabs[1].gid === '222');
}

// ── Case 5: integrasi — discover lalu register mengecualikan yang barusan didaftarkan ──
{
  const html =
    '<a href="#gid=1">Satu</a><a href="#gid=2">Dua</a><a href="#gid=3">Tiga</a>';
  const tabs = parsePubhtmlTabs(html);
  const round1 = newTabsToRegister(tabs, ['1']); // gid 2,3 baru
  const afterRound1 = ['1', ...round1.map((t) => t.gid)];
  const round2 = newTabsToRegister(tabs, afterRound1); // semua sudah → kosong
  check('5. round-1 daftarkan 2,3; round-2 kosong', gids(round1) === '2,3' && round2.length === 0);
}

console.log(failed === 0 ? '\n✅ SEMUA LULUS\n' : `\n❌ ${failed} GAGAL\n`);
process.exit(failed === 0 ? 0 : 1);
