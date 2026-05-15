/**
 * Seed data real: program akhwat "Itsnain Fi Wahid" — 2 kelompok.
 *
 * ADITIF: tidak menghapus data ikhwan (Maahir) yang sudah ada.
 *
 * Yang ditambahkan:
 *   - 1 koordinator akhwat (Ustadzah Salma) — di-skip jika WA sudah ada
 *   - 2 musyrifah (PJ Kelompok 1 & 2) — di-skip per nomor jika WA sudah ada
 *   - 2 kelas akhwat: "Kelompok 1", "Kelompok 2"
 *   - Peserta tiap kelompok (PJ di-skip dari list peserta karena sudah jadi
 *     musyrifah dengan WA sama; auth memilih peserta dulu sehingga akan
 *     menghalangi login musyrifah)
 *
 * Default password musyrifah/koordinator: "password123"
 * Default password peserta:               "itsnain123"
 * Ganti via `npm run set-password`.
 *
 * Cara pakai:
 *   npm run seed-itsnain
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { normalizeWhatsApp } from '../src/lib/whatsapp';

const DEFAULT_PASSWORD_MUSYRIF = 'password123';
const DEFAULT_PASSWORD_PESERTA = 'itsnain123';

const KOORDINATOR_AKHWAT = {
  name: 'Ustadzah Salma',
  wa: '6282136573097',
};

interface PesertaEntry {
  name: string;
  wa: string;
}
interface KelompokEntry {
  name: string;
  pj: { name: string; wa: string };
  peserta: PesertaEntry[];
}

const KELOMPOK: KelompokEntry[] = [
  {
    name: 'Kelompok 1',
    pj: { name: 'Tasmiah Siti Salamah', wa: '895322125069' },
    peserta: [
      { name: 'Risa Afrianti', wa: '87751645069' },
      { name: 'Farha Sholihah', wa: '82249582671' },
      { name: 'Fathia Alya', wa: '81281192703' },
      { name: 'Cahlina Kinasih', wa: '87883985090' },
      { name: 'Rafika Salma', wa: '85280159698' },
      { name: 'Wildatun Uyun', wa: '81353430149' },
      { name: 'Nur Fidha Alifa', wa: '85710711676' },
      { name: 'Nur Layla', wa: '89673092288' },
      // Tasmiah Siti Salamah — sudah jadi musyrifah (PJ K1), skip dari peserta
      { name: 'Nadiyah Alamanda', wa: '87889284677' },
      { name: 'Annisa Rizkya', wa: '82154905557' },
      { name: 'Andi Hikmah Amaliyah', wa: '85157886962' },
      { name: 'Jesi Alya', wa: '82287440105' },
      { name: 'Umi Hidayati', wa: '81280683665' },
      { name: 'Silmi Muthmainnah Alumni', wa: '89517315052' },
      { name: 'Nabilla Putri Hasdar', wa: '85107012760' },
      { name: 'Royhana Safira Pardiani', wa: '82391571790' },
      { name: 'Annidaul Jannah', wa: '85788064547' },
      { name: 'Rika Ramadhona', wa: '85373700618' },
      { name: 'Zakia Annajah', wa: '6282137600976' },
      { name: 'Siti Haerun Nisa Zain', wa: '85973281100' },
      { name: 'Ruqayyah', wa: '89653402400' },
      { name: 'Nafilatullatifah', wa: '85394650595' },
      { name: 'Putri Ramadhani Austi', wa: '628992852672' },
      { name: 'Atikah Az Zahwa', wa: '83143228400' },
      { name: 'Ismi Khoiriyah', wa: '6285784824142' },
      { name: 'Vita Oktaviani', wa: '081272958629' },
      { name: 'Nyayu Safira Rahma', wa: '085964232366' },
      { name: 'Adhwa Khoirunnisa', wa: '81233271258' },
      { name: 'Baiq Miftahul Husna', wa: '87855729712' },
      { name: 'Nurul Azizah', wa: '81341334870' },
      { name: 'Miftahul Amalia', wa: '82252660165' },
      { name: 'Siti Rohana', wa: '81358145992' },
      { name: "Da'an Nurrayyan", wa: '8161355255' },
      { name: 'Fatimah Azzahro', wa: '6287701502346' },
      { name: 'Iin Dawani', wa: '81541551347' },
      { name: "Fathimah Fa'iqoh", wa: '81381855545' },
      { name: 'Salma Khoiriyah', wa: '81904434357' },
    ],
  },
  {
    name: 'Kelompok 2',
    pj: { name: 'Aulia Khairunnisa Mahbengi', wa: '8116800702' },
    peserta: [
      { name: 'Asiyah Annaajiyah', wa: '81615636276' },
      { name: 'Feni Damayanti', wa: '62895327649242' },
      { name: 'Fitria Khairunnisa', wa: '87840533822' },
      { name: 'Putri Wahyuningsih', wa: '85215266117' },
      { name: 'Asri Dewi Lestari', wa: '87824132291' },
      { name: 'Shofiyyah Azzah', wa: '82134316482' },
      { name: 'Puteri Chamelia Ulfah', wa: '85161428186' },
      { name: 'Fanny Anastasiah', wa: '87728977800' },
      { name: 'Zerina Br Singarimbun', wa: '85297464367' },
      { name: 'Laura Rachima', wa: '81293559403' },
      { name: 'Salma Suhailah Nizzati', wa: '82131217655' },
      { name: 'Annisa Nurrahmah', wa: '89527038238' },
      { name: 'Talida Jihan Nabila', wa: '81994771197' },
      { name: 'Laila Safira', wa: '85211379646' },
      { name: 'Lubna Rohmayanti', wa: '82339846513' },
      { name: 'Aisyah binti Muhammad', wa: '81374520890' },
      { name: 'Zulfa Masitoh', wa: '83103727282' },
      { name: 'Salma Rifdatul Husna', wa: '81296978844' },
      { name: 'Aulia Azizah', wa: '82337495351' },
      // Aulia Khairunnisa Mahbengi — sudah jadi musyrifah (PJ K2), skip dari peserta
      { name: 'Putri Nur Sarjiari', wa: '85899409895' },
      { name: 'Atalika Khairunnisa', wa: '85797820878' },
      { name: 'Dzakiyyah Rahmah', wa: '81344941255' },
    ],
  },
];

async function main() {
  console.log('Hashing password default…');
  const hashMusyrif = await bcrypt.hash(DEFAULT_PASSWORD_MUSYRIF, 12);
  const hashPeserta = await bcrypt.hash(DEFAULT_PASSWORD_PESERTA, 12);

  // ─── [1/4] Koordinator akhwat ────────────────────────────────────
  console.log('\n[1/4] Insert koordinator akhwat (Ustadzah Salma)…');
  const koorWa = normalizeWhatsApp(KOORDINATOR_AKHWAT.wa);
  const { data: existingKoor } = await supabaseAdmin
    .from('koordinator')
    .select('id, name')
    .eq('whatsapp_number', koorWa)
    .maybeSingle();
  if (existingKoor) {
    console.log(`  ⊘ Sudah ada: ${existingKoor.name} (${koorWa}) — skip`);
  } else {
    const { data, error } = await supabaseAdmin
      .from('koordinator')
      .insert({
        name: KOORDINATOR_AKHWAT.name,
        whatsapp_number: koorWa,
        password_hash: hashMusyrif,
      })
      .select('id, name, whatsapp_number')
      .single();
    if (error) throw error;
    console.log(`  ✓ ${data.name} (${data.whatsapp_number})`);
  }

  // ─── [2/4] Musyrifah (PJ tiap kelompok) ──────────────────────────
  console.log('\n[2/4] Insert musyrifah (PJ Kelompok 1 & 2)…');
  const musyrifByKelompok = new Map<string, { id: string; name: string }>();
  for (const k of KELOMPOK) {
    const wa = normalizeWhatsApp(k.pj.wa);
    const { data: existing } = await supabaseAdmin
      .from('musyrif')
      .select('id, name')
      .eq('whatsapp_number', wa)
      .maybeSingle();
    if (existing) {
      console.log(`  ⊘ Sudah ada: ${existing.name} (${wa}) — pakai existing untuk ${k.name}`);
      musyrifByKelompok.set(k.name, existing);
      continue;
    }
    const { data, error } = await supabaseAdmin
      .from('musyrif')
      .insert({
        name: k.pj.name,
        gender: 'akhwat',
        whatsapp_number: wa,
        password_hash: hashMusyrif,
      })
      .select('id, name')
      .single();
    if (error) throw error;
    console.log(`  ✓ ${data.name} → PJ ${k.name}`);
    musyrifByKelompok.set(k.name, data);
  }

  // ─── [3/4] Kelas akhwat ──────────────────────────────────────────
  console.log('\n[3/4] Insert kelas akhwat…');
  const kelasIdByName = new Map<string, string>();
  for (const k of KELOMPOK) {
    const musyrif = musyrifByKelompok.get(k.name)!;
    // Cek apakah kelas (name, gender) sudah ada — unique constraint di schema.
    const { data: existingKelas } = await supabaseAdmin
      .from('kelas')
      .select('id, name, musyrif_id')
      .eq('name', k.name)
      .eq('gender', 'akhwat')
      .maybeSingle();
    if (existingKelas) {
      console.log(`  ⊘ Sudah ada: kelas "${k.name}" (akhwat) — pakai existing`);
      kelasIdByName.set(k.name, existingKelas.id);
      continue;
    }
    const { data, error } = await supabaseAdmin
      .from('kelas')
      .insert({
        name: k.name,
        gender: 'akhwat',
        musyrif_id: musyrif.id,
      })
      .select('id, name')
      .single();
    if (error) throw error;
    console.log(`  ✓ Kelas "${data.name}" (akhwat) — musyrifah: ${musyrif.name}`);
    kelasIdByName.set(k.name, data.id);
  }

  // ─── [4/4] Peserta akhwat ────────────────────────────────────────
  console.log('\n[4/4] Insert peserta akhwat…');
  let totalInserted = 0;
  let totalSkipped = 0;
  for (const k of KELOMPOK) {
    const kelasId = kelasIdByName.get(k.name)!;
    let inserted = 0;
    let skipped = 0;
    for (const p of k.peserta) {
      const wa = normalizeWhatsApp(p.wa);
      const { data: existing } = await supabaseAdmin
        .from('peserta')
        .select('id, name')
        .eq('whatsapp_number', wa)
        .maybeSingle();
      if (existing) {
        console.log(`    ⊘ ${p.name} (${wa}) sudah ada — skip`);
        skipped++;
        continue;
      }
      const { error } = await supabaseAdmin.from('peserta').insert({
        name: p.name,
        gender: 'akhwat',
        kelas_id: kelasId,
        whatsapp_number: wa,
        password_hash: hashPeserta,
      });
      if (error) throw error;
      inserted++;
    }
    console.log(`  ✓ ${k.name}: ${inserted} peserta baru, ${skipped} skip`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  console.log(
    `\n✓ Selesai. Total peserta baru: ${totalInserted} (skip ${totalSkipped}).`
  );
  console.log(`Default password musyrifah/koordinator: "${DEFAULT_PASSWORD_MUSYRIF}"`);
  console.log(`Default password peserta:               "${DEFAULT_PASSWORD_PESERTA}"`);
  console.log(`Ganti via: npm run set-password`);
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
