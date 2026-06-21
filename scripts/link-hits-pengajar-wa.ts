/**
 * FASE 2 — Link/provision pengajar HITS yang belum ter-link (pengajar_id null).
 *
 *   npm run link-hits-pengajar-wa
 *
 * WA diambil dari docs/"Nama Pengajar Tilawah  (3).xlsx" + 4 input manual.
 * Untuk tiap halaqah pengajar_id null (3 batch Jan/Apr/Jun):
 *   1. cocokkan pengajar_nama_sheet → mapping nama→WA (per gender, via nameKey).
 *   2. link ke akun pengajar existing (whatsapp_number) bila ada; else provision akun baru.
 *   3. update hits_halaqah.pengajar_id + pengajar_wa.
 * Re-run aman.
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeWhatsApp } from '../src/lib/whatsapp';
import type { Gender } from '../src/types/db';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function stripGelar(name: string): string {
  return name.replace(/^\s*(ustadz(ah)?|ust\.?|ustad)\s+/i, '').trim();
}
function nameKey(name: string): string {
  return stripGelar(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Mapping nama (apa adanya dari pengajar_nama_sheet) → WA. Dikunci via nameKey().
const MAP: Record<Gender, { name: string; wa: string }[]> = {
  akhwat: [
    { name: 'Aisyah', wa: '6281374520890' },
    { name: 'Asiah Annaajiyah', wa: '6281615636276' },
    { name: 'Aulia Khairunnisa Mahbengi', wa: '628116800702' },
    { name: 'Fachira Rachma', wa: '6281527614447' },
    { name: 'Nabila Ulya', wa: '6281383876738' },
    { name: 'Putri Camelia ulfah', wa: '6285161428186' },
    { name: 'Rika Ramadhona', wa: '6285373700618' },
    { name: 'Sarah Rizki Anugrah', wa: '6282284383451' },
    { name: 'Wildatun Uyun', wa: '6281353430149' },
    { name: 'Zalfa Ayu Adillah', wa: '6281237110700' },
    { name: 'Nur Latifah Anshoriah', wa: '628811644171' },
    { name: 'Rinny Chandrawatty', wa: '628118000683' },
  ],
  ikhwan: [
    { name: 'Abdullah Mubarak Al Habsy', wa: '6285718965202' },
    { name: 'Adam Malik Nurzuhdi Al Suyudi', wa: '6281280630437' },
    { name: 'Muhammad Habibie', wa: '6289506847572' },
    { name: 'Muhammad Abdul Razaq', wa: '6281282873891' },
    { name: 'Muhammad Afif Hamude', wa: '6282245934001' },
  ],
};

async function main() {
  console.log('\n🔗 Link/provision pengajar HITS tanpa WA\n');

  // mapping key → {wa, name} per gender
  const byKey: Record<Gender, Map<string, { wa: string; name: string }>> = {
    ikhwan: new Map(), akhwat: new Map(),
  };
  for (const g of ['ikhwan', 'akhwat'] as Gender[]) {
    for (const m of MAP[g]) byKey[g].set(nameKey(m.name), { wa: normalizeWhatsApp(m.wa), name: m.name });
  }

  // halaqah yang masih null pengajar di 3 batch
  const { data: batches, error: bErr } = await supabaseAdmin
    .from('hits_batch').select('id')
    .in('slug', ['hits-online-januari-2026', 'hits-online-april-2026', 'hits-online-juni-2026']);
  if (bErr) throw bErr;
  const batchIds = (batches ?? []).map((b) => b.id);

  const { data: halaqah, error: hErr } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, pengajar_nama_sheet')
    .in('batch_id', batchIds)
    .is('pengajar_id', null)
    .not('pengajar_nama_sheet', 'is', null);
  if (hErr) throw hErr;

  // kelompok placeholder per gender (untuk provision)
  const kelompokId: Partial<Record<Gender, string>> = {};
  async function ensureKelompok(gender: Gender): Promise<string> {
    if (kelompokId[gender]) return kelompokId[gender]!;
    const { data: k } = await supabaseAdmin
      .from('kelompok_pengajar').select('id').eq('gender', gender).limit(1).maybeSingle();
    if (k) { kelompokId[gender] = k.id; return k.id; }
    const { data: ins, error } = await supabaseAdmin
      .from('kelompok_pengajar').insert({ name: `Pengajar HITS ${gender}`, gender }).select('id').single();
    if (error) throw error;
    kelompokId[gender] = ins.id;
    return ins.id;
  }
  // cache wa → pengajar_id (akun existing/baru) supaya tak provision dobel
  const pengajarByWa = new Map<string, string>();
  {
    const { data: rows } = await supabaseAdmin.from('pengajar').select('id, whatsapp_number');
    for (const p of rows ?? []) if (p.whatsapp_number) pengajarByWa.set(normalizeWhatsApp(p.whatsapp_number), p.id);
  }

  const report = { linked: 0, provisioned: [] as { name: string; wa: string; gender: Gender }[], skipped: [] as string[] };

  for (const h of halaqah ?? []) {
    const gender = (h.gender as Gender) ?? 'ikhwan';
    const key = nameKey(h.pengajar_nama_sheet as string);
    const m = byKey[gender].get(key);
    if (!m) { report.skipped.push(`[${gender}] ${h.pengajar_nama_sheet} (${h.name})`); continue; }

    let pengajarId = pengajarByWa.get(m.wa) ?? null;
    if (!pengajarId) {
      const kelompok = await ensureKelompok(gender);
      // idx_pengajar_wa bukan unique → tak bisa onConflict. Akun existing sudah
      // tercover pengajarByWa (preload), jadi branch ini pasti WA baru → insert.
      const { data: p, error } = await supabaseAdmin
        .from('pengajar')
        .insert({ name: m.name, gender, whatsapp_number: m.wa, password_hash: '', kelompok_id: kelompok, active: true })
        .select('id').single();
      if (error) throw error;
      pengajarId = p.id;
      pengajarByWa.set(m.wa, p.id);
      report.provisioned.push({ name: m.name, wa: m.wa, gender });
    } else {
      report.linked++;
    }

    const { error: uErr } = await supabaseAdmin
      .from('hits_halaqah')
      .update({ pengajar_id: pengajarId, pengajar_wa: m.wa })
      .eq('id', h.id);
    if (uErr) throw uErr;
  }

  console.log('══════════ RINGKASAN FASE 2 ══════════');
  console.log(`  Halaqah diproses : ${(halaqah ?? []).length}`);
  console.log(`  Linked ke akun existing : ${report.linked}`);
  console.log(`  Akun pengajar baru      : ${report.provisioned.length}`);
  for (const p of report.provisioned) console.log(`     + [${p.gender}] ${p.name} (${p.wa})`);
  if (report.skipped.length) {
    console.log(`\n  ⚠ Tak ada di mapping (di-skip): ${report.skipped.length}`);
    for (const s of report.skipped) console.log(`     - ${s}`);
  }
  console.log('\n✅ Selesai.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
