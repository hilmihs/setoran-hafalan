/**
 * test-shim-runtime.ts — uji shim lewat SELURUH stack runtime:
 *   supabaseAdmin (singleton) → pg.Pool → wire protocol → PGlite (pg-serve-test).
 * Membuktikan serialisasi parameter node-postgres (array utk .in, jsonb, enum)
 * benar di jalur produksi, bukan hanya PGlite langsung.
 *
 * Prasyarat: `npx tsx scripts/pg-serve-test.ts` sudah jalan (127.0.0.1:54329).
 * Jalankan:  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres \
 *            SESSION_SECRET=xxx tsx scripts/test-shim-runtime.ts
 */
import { supabaseAdmin } from '../src/lib/supabase-admin';

let pass = 0, fail = 0;
function check(n: string, ok: boolean, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.error(`  ✗ ${n} ${extra}`); }
}

async function main() {
  // 1. embed 2-level (persis dipakai app) via wire
  const { data: p, error: e1 } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas:kelas_id(id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number))')
    .limit(1)
    .maybeSingle();
  check('embed 2-level via wire', !e1 && !!p && (p.kelas === null || typeof p.kelas === 'object'), JSON.stringify(e1));

  // 2. .in array param over wire
  const { data: ks } = await supabaseAdmin.from('kelas').select('id').limit(3);
  const ids = (ks ?? []).map((k: any) => k.id);
  const { data: inRes, error: e2 } = await supabaseAdmin.from('kelas').select('id, name').in('id', ids);
  check('.in array param wire', !e2 && Array.isArray(inRes) && inRes.length === ids.length, JSON.stringify(e2));

  // 3. .or is.null + eq wire
  const { data: orRes, error: e3 } = await supabaseAdmin
    .from('koordinator')
    .select('id')
    .or('last_login_at.is.null,last_login_at.lt.2020-01-01');
  check('.or is.null wire', !e3 && Array.isArray(orRes), JSON.stringify(e3));

  // 4. count head wire
  const { count, error: e4 } = await supabaseAdmin.from('audit_log').select('id', { count: 'exact', head: true });
  check('count head wire = 4432', !e4 && count === 4432, `count=${count} ${JSON.stringify(e4)}`);

  // 5. upsert onConflict wire (jsonb/enum aman)
  const { data: rek } = await supabaseAdmin.from('rekaman').select('setoran_id, jenis').limit(1).maybeSingle();
  if (rek) {
    const { error: e5 } = await supabaseAdmin
      .from('rekaman')
      .upsert({ setoran_id: rek.setoran_id, jenis: rek.jenis, audio_url: 'wire/test.webm' }, { onConflict: 'setoran_id,jenis' });
    const { data: after } = await supabaseAdmin.from('rekaman').select('audio_url').eq('setoran_id', rek.setoran_id).eq('jenis', rek.jenis).maybeSingle();
    check('upsert onConflict wire', !e5 && after?.audio_url === 'wire/test.webm', JSON.stringify(after));
  } else check('upsert onConflict wire', false, 'no rekaman');

  // 6. insert enum + RETURNING wire, lalu delete
  const { data: ins, error: e6 } = await supabaseAdmin
    .from('session_log')
    .insert({ actor_role: 'koordinator', actor_id: '00000000-0000-0000-0000-000000000009' })
    .select('id, actor_role');
  const ok6 = !e6 && Array.isArray(ins) && ins[0]?.actor_role === 'koordinator';
  check('insert enum + RETURNING wire', ok6, JSON.stringify(e6));
  if (ok6) await supabaseAdmin.from('session_log').delete().eq('id', ins[0].id);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
