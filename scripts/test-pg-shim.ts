/**
 * test-pg-shim.ts — uji shim supabase-js→pg terhadap data hasil restore (PGlite).
 * Menjalankan pola query yg persis dipakai aplikasi. Jalankan: npm run test-shim
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadData } from '../db-migration/load-data';
import { createPgClient } from '../src/lib/pg-shim';
import { resetMeta, type Exec } from '../src/lib/pg-core';

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

async function main() {
  resetMeta();
  const db = new PGlite();
  const exec: Exec = async (t, p) => {
    const r = await db.query(t, p as any[]);
    return { rows: r.rows as any[], rowCount: (r as any).affectedRows ?? (r.rows as any[]).length };
  };
  await db.exec(await readFile(join(ROOT, 'db-migration/00_roles.sql'), 'utf8'));
  await db.exec(await readFile(join(ROOT, 'db-migration/schema.sql'), 'utf8'));
  await loadData(
    (t, pr) => db.query(t, pr as any[]).then((r) => ({ rows: r.rows as any[] })),
    join(ROOT, '_backup_supabase/data'),
    { truncate: true }
  );
  console.log('data restored ke PGlite\n');

  const sb = createPgClient(exec);

  // 1. select + eq + maybeSingle
  {
    const { data, error } = await sb.from('peserta').select('id, name, gender, kelas_id').limit(1).maybeSingle();
    check('select+maybeSingle peserta', !error && !!data && typeof data.id === 'string', JSON.stringify(error));
    // simpan utk test lain
    (globalThis as any)._peserta = data;
  }

  // 2. embedded join 2-level (persis dipakai app)
  {
    const p = (globalThis as any)._peserta;
    const { data, error } = await sb
      .from('peserta')
      .select('id, name, gender, kelas:kelas_id(id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number))')
      .eq('id', p.id)
      .maybeSingle();
    check('embed 2-level: kelas ada', !error && !!data, JSON.stringify(error));
    const kelasOk = data && (data.kelas === null || (typeof data.kelas === 'object' && 'name' in data.kelas));
    check('embed: kelas objek/null', !!kelasOk);
    const musyrifOk = !data?.kelas || data.kelas.musyrif === null || (typeof data.kelas.musyrif === 'object' && 'name' in data.kelas.musyrif);
    check('embed: kelas.musyrif nested', !!musyrifOk, JSON.stringify(data?.kelas));
  }

  // 3. count exact + head
  {
    const { count, data, error } = await sb.from('audit_log').select('id', { count: 'exact', head: true });
    check('count head audit_log=4432', !error && count === 4432 && (data === null || (Array.isArray(data) && data.length === 0)), `count=${count} err=${JSON.stringify(error)}`);
  }

  // 4. count exact (with rows)
  {
    const { count, data, error } = await sb.from('kelas').select('id, name', { count: 'exact' });
    check('count+rows kelas=10', !error && count === 10 && Array.isArray(data) && data.length === 10, `count=${count} n=${(data as any)?.length}`);
  }

  // 5. .in + order
  {
    const { data, error } = await sb.from('kelas').select('id, name').order('name', { ascending: true }).limit(3);
    check('order+limit kelas', !error && Array.isArray(data) && data.length === 3, JSON.stringify(error));
  }

  // 6. insert + select (RETURNING) — pakai tabel netral session_log
  {
    const { data, error } = await sb
      .from('session_log')
      .insert({ actor_role: 'musyrif', actor_id: '00000000-0000-0000-0000-000000000001' })
      .select('id, actor_role');
    const ok = !error && Array.isArray(data) && data.length === 1 && data[0].actor_role === 'musyrif';
    check('insert+RETURNING session_log', ok, JSON.stringify(error) + JSON.stringify(data));
    (globalThis as any)._logId = Array.isArray(data) ? data[0]?.id : null;
  }

  // 7. update + eq + select
  {
    const id = (globalThis as any)._logId;
    const { data, error } = await sb.from('session_log').update({ ip_address: '127.0.0.1' }).eq('id', id).select('id, ip_address');
    check('update+eq+RETURNING', !error && Array.isArray(data) && data[0]?.ip_address === '127.0.0.1', JSON.stringify(error));
  }

  // 8. upsert onConflict (rekaman: setoran_id,jenis unik)
  {
    const { data: rek } = await sb.from('rekaman').select('setoran_id, jenis, audio_url').limit(1).maybeSingle();
    if (rek) {
      const { error } = await sb
        .from('rekaman')
        .upsert({ setoran_id: rek.setoran_id, jenis: rek.jenis, audio_url: 'X/shim-test.webm' }, { onConflict: 'setoran_id,jenis' });
      const { data: after } = await sb.from('rekaman').select('audio_url').eq('setoran_id', rek.setoran_id).eq('jenis', rek.jenis).maybeSingle();
      check('upsert onConflict update', !error && after?.audio_url === 'X/shim-test.webm', JSON.stringify(after));
    } else check('upsert onConflict update', false, 'no rekaman row');
  }

  // 9. delete + eq
  {
    const id = (globalThis as any)._logId;
    const { error } = await sb.from('session_log').delete().eq('id', id);
    const { data: gone } = await sb.from('session_log').select('id').eq('id', id).maybeSingle();
    check('delete+eq', !error && gone === null, JSON.stringify(error));
  }

  // 10. enum eq + many mode
  {
    const { data, error } = await sb.from('peserta').select('id, gender').eq('gender', 'ikhwan');
    const ok = !error && Array.isArray(data) && data.every((r: any) => r.gender === 'ikhwan');
    check('enum eq (gender=ikhwan) many', ok, JSON.stringify(error));
  }

  // 11. in() filter
  {
    const { data: two } = await sb.from('kelas').select('id').limit(2);
    const ids = (two as any[]).map((r) => r.id);
    const { data, error } = await sb.from('kelas').select('id, name').in('id', ids);
    check('in() filter', !error && Array.isArray(data) && data.length === ids.length, JSON.stringify(error));
  }

  // 12. .or simple (gender)
  {
    const { data, error } = await sb.from('peserta').select('id, gender').or('gender.eq.ikhwan,gender.eq.akhwat');
    check('.or simple = semua', !error && Array.isArray(data) && data.length === 84, `n=${(data as any)?.length} ${JSON.stringify(error)}`);
  }

  // 13. .or nested and(...) — pola koordinator_notes visibility
  {
    const { error } = await sb
      .from('koordinator_notes')
      .select('id, visibility, author_id')
      .or(`visibility.eq.peer,and(visibility.eq.private,author_id.eq.00000000-0000-0000-0000-000000000001)`);
    check('.or nested and() (tak error)', !error, JSON.stringify(error));
  }

  // 14. .or with is.null + lt (pola koordinator inactive)
  {
    const { data, error } = await sb
      .from('koordinator')
      .select('id')
      .or(`last_login_at.is.null,last_login_at.lt.2020-01-01`);
    check('.or is.null,lt', !error && Array.isArray(data), JSON.stringify(error));
  }

  // 15. .not is null
  {
    const { data, error } = await sb.from('kelas').select('id').not('id', 'is', null);
    check('.not id is null = semua', !error && Array.isArray(data) && data.length === 10, JSON.stringify(error));
  }

  // 16. mutation count (delete count)
  {
    const { data: ins, error: insErr } = await sb
      .from('session_log')
      .insert({ actor_role: 'syaikh', actor_id: '00000000-0000-0000-0000-000000000002' })
      .select('id');
    if (insErr || !Array.isArray(ins) || !ins[0]) {
      check('delete {count:exact}', false, 'insert gagal: ' + JSON.stringify(insErr));
    } else {
      const { count, error } = await sb.from('session_log').delete({ count: 'exact' }).eq('id', ins[0].id);
      check('delete {count:exact}', !error && count === 1, `count=${count} ${JSON.stringify(error)}`);
    }
  }

  await db.close();
  console.log(`\n${passed} lulus, ${failed} gagal`);
  if (failed) process.exit(1);
  console.log('✅ SHIM TEST LULUS');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
