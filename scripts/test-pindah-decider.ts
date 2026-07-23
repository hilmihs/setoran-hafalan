/**
 * Test resolveDecider (pure, tanpa DB): siapa berhak memutuskan pengajuan
 * pindah/pengambilan halaqah.
 *   npx tsx scripts/test-pindah-decider.ts
 */
import { resolveDecider } from '../src/lib/hits-pindah-decider';

const kkAk: any = { role: 'koordinator_ketua_kelas', koordinator_kk_id: 'kk-ak', name: 'Talida', gender: 'akhwat' };
const kkIk: any = { role: 'koordinator_ketua_kelas', koordinator_kk_id: 'kk-ik', name: 'Adam', gender: 'ikhwan' };
const owner: any = { role: 'pengajar', pengajar_id: 'p-owner', name: 'Zulfa' };
const stranger: any = { role: 'pengajar', pengajar_id: 'p-x', name: 'X' };

const claim = { request_type: 'claim_in', target_pengajar_id: null, target_wa: null, approver_pengajar_id: null, approver_wa: '628OWNER' };
const xfer = { request_type: 'transfer_out', target_pengajar_id: 'p-x', target_wa: null, approver_pengajar_id: null, approver_wa: null };

let fail = 0;
const ck = (n: string, c: boolean, x = '') => { console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); if (!c) fail++; };

ck('KK akhwat approve claim akhwat', resolveDecider(claim, 'akhwat', [kkAk], null)?.role === 'koordinator_ketua_kelas');
ck('KK ikhwan DITOLAK di halaqah akhwat', resolveDecider(claim, 'akhwat', [kkIk], null) === null);
ck('owner (via WA) tetap bisa', resolveDecider(claim, 'akhwat', [owner], '628OWNER')?.role === 'pengajar');
ck('pengajar asing ditolak', resolveDecider(claim, 'akhwat', [stranger], '628X') === null);
ck('owner + KK: owner menang', resolveDecider(claim, 'akhwat', [kkAk, owner], '628OWNER')?.id === 'p-owner');
ck('transfer_out ke target pengajar utuh', resolveDecider(xfer, 'ikhwan', [stranger], null)?.id === 'p-x');
ck('KK TIDAK berlaku utk transfer_out', resolveDecider(xfer, 'ikhwan', [kkIk], null) === null);

console.log(fail ? `\n❌ ${fail} gagal` : '\n✅ SEMUA LULUS');
process.exit(fail ? 1 : 0);
