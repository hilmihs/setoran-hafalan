/**
 * Seed data real: program akhwat "Itsnain Fi Wahid" — 5 kelas paralel
 * (Maahir Alif, Ba, Dal, Ha pagi, Ha siang).
 *
 * WIPE akhwat-only lalu re-seed. Ikhwan (Maahir) tidak disentuh.
 * Koordinator Ustadzah Salma di-handle aditif.
 *
 * Default password musyrifah/koordinator: "password123"
 * Default password peserta:               "itsnain123"
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin, AUDIO_BUCKET } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

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
interface KelasEntry {
  name: string;
  musyrif: { name: string; wa: string };
  peserta: PesertaEntry[];
}

const KELAS_AKHWAT: KelasEntry[] = [
  {
    name: 'Maahir Alif',
    musyrif: { name: 'Risa Afrianti', wa: '87751645069' },
    peserta: [
      { name: 'Farha Sholihah', wa: '82249582671' },
      { name: 'Fathia Alya', wa: '81281192703' },
      { name: 'Cahlina Kinasih', wa: '87883985090' },
      { name: 'Rafika Salma', wa: '85280159698' },
      { name: 'Wildatun Uyun', wa: '81353430149' },
      { name: 'Siti Haerun Nisa Zain', wa: '85973281100' },
      { name: 'Ruqayyah', wa: '89653402400' },
      { name: 'Nafilatullatifah', wa: '85394650595' },
      { name: 'Nyayu Safira Rahma', wa: '085964232366' },
    ],
  },
  {
    name: 'Maahir Ba',
    musyrif: { name: 'Jesi Alya', wa: '82287440105' },
    peserta: [
      { name: 'Nur Fidha Alifa', wa: '85710711676' },
      { name: 'Nur Layla', wa: '89673092288' },
      { name: 'Tasmiah Siti Salamah', wa: '895322125069' },
      { name: 'Nadiyah Alamanda', wa: '87889284677' },
      { name: 'Annisa Rizkya', wa: '82154905557' },
      { name: 'Andi Hikmah Amaliyah', wa: '85157886962' },
      { name: 'Umi Hidayati', wa: '81280683665' },
      { name: 'Silmi Muthmainnah', wa: '89517315052' },
      { name: 'Nabilla Putri Hasdar', wa: '85107012760' },
      { name: 'Royhana Safira Pardiani', wa: '82391571790' },
      { name: 'Annidaul Jannah', wa: '85788064547' },
    ],
  },
  {
    name: 'Maahir Dal',
    musyrif: { name: 'Baiq Miftahul Husna', wa: '87855729712' },
    peserta: [
      { name: 'Adhwa Khoirunnisa', wa: '81233271258' },
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
    name: 'Maahir Ha pagi',
    musyrif: { name: 'Feni Damayanti', wa: '62895327649242' },
    peserta: [
      { name: 'Asiyah Annaajiyah', wa: '81615636276' },
      { name: 'Fitria Khairunnisa', wa: '87840533822' },
      { name: 'Putri Wahyuningsih', wa: '85215266117' },
      { name: 'Asri Dewi Lestari', wa: '87824132291' },
      { name: 'Puteri Chamelia Ulfah', wa: '85161428186' },
      { name: 'Fanny Anastasiah', wa: '87728977800' },
      { name: 'Zerina Br Singarimbun', wa: '85297464367' },
      { name: 'Laura Rachima', wa: '81293559403' },
      { name: 'Salma Suhailah Nizzati', wa: '82131217655' },
    ],
  },
  {
    name: 'Maahir Ha siang',
    musyrif: { name: 'Aulia Khairunnisa', wa: '8116800702' },
    peserta: [
      { name: 'Annisa Nurrahmah', wa: '89527038238' },
      { name: 'Talida Jihan Nabila', wa: '81994771197' },
      { name: 'Laila Safira', wa: '85211379646' },
      { name: 'Lubna Rohmayanti', wa: '82339846513' },
      { name: 'Aisyah binti Muhammad', wa: '81374520890' },
      { name: 'Zulfa Masitoh', wa: '83103727282' },
      { name: 'Salma Rifdatul Husna', wa: '81296978844' },
      { name: 'Aulia Azizah', wa: '82337495351' },
      { name: 'Putri Nur Sarjiari', wa: '85899409895' },
      { name: 'Atalika Khairunnisa', wa: '85797820878' },
      { name: 'Dzakiyyah Rahmah', wa: '81344941255' },
    ],
  },
];

export async function runSeedItsnain(log: (s: string) => void): Promise<void> {
  log('Hashing password default…');
  const hashMusyrif = await bcrypt.hash(DEFAULT_PASSWORD_MUSYRIF, 12);
  const hashPeserta = await bcrypt.hash(DEFAULT_PASSWORD_PESERTA, 12);

  // ─── [1/5] Koordinator akhwat (aditif) ───────────────────────────
  log('[1/5] Insert koordinator akhwat (Ustadzah Salma)…');
  const koorWa = normalizeWhatsApp(KOORDINATOR_AKHWAT.wa);
  const { data: existingKoor } = await supabaseAdmin
    .from('koordinator')
    .select('id, name')
    .eq('whatsapp_number', koorWa)
    .maybeSingle();
  if (existingKoor) {
    log(`  ⊘ Sudah ada: ${existingKoor.name} (${koorWa}) — skip`);
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
    log(`  ✓ ${data.name} (${data.whatsapp_number})`);
  }

  // ─── [2/5] Wipe data akhwat (storage + DB) ───────────────────────
  log('[2/5] Wipe data akhwat lama…');

  const { data: akhwatPeserta, error: pSelErr } = await supabaseAdmin
    .from('peserta')
    .select('id')
    .eq('gender', 'akhwat');
  if (pSelErr) throw pSelErr;
  const akhwatPesertaIds = (akhwatPeserta ?? []).map((p) => p.id);
  log(`  · ${akhwatPesertaIds.length} peserta akhwat ditemukan`);

  if (akhwatPesertaIds.length > 0) {
    const { data: akhwatSetoran, error: sSelErr } = await supabaseAdmin
      .from('setoran')
      .select('id')
      .in('peserta_id', akhwatPesertaIds);
    if (sSelErr) throw sSelErr;
    const akhwatSetoranIds = (akhwatSetoran ?? []).map((s) => s.id);

    if (akhwatSetoranIds.length > 0) {
      const { data: akhwatRekaman, error: rSelErr } = await supabaseAdmin
        .from('rekaman')
        .select('id, audio_url')
        .in('setoran_id', akhwatSetoranIds);
      if (rSelErr) throw rSelErr;

      const audioPaths = (akhwatRekaman ?? [])
        .map((r) => r.audio_url)
        .filter((p): p is string => !!p);
      if (audioPaths.length > 0) {
        const { error: storageErr } = await supabaseAdmin.storage
          .from(AUDIO_BUCKET)
          .remove(audioPaths);
        if (storageErr) throw storageErr;
        log(`  · ${audioPaths.length} file audio dihapus dari storage`);
      }
    }

    if (akhwatSetoranIds.length > 0) {
      const { error: rDelErr, count: rCount } = await supabaseAdmin
        .from('rekaman')
        .delete({ count: 'exact' })
        .in('setoran_id', akhwatSetoranIds);
      if (rDelErr) throw rDelErr;
      log(`  · ${rCount ?? 0} row rekaman dihapus`);

      const { error: sDelErr, count: sCount } = await supabaseAdmin
        .from('setoran')
        .delete({ count: 'exact' })
        .in('id', akhwatSetoranIds);
      if (sDelErr) throw sDelErr;
      log(`  · ${sCount ?? 0} row setoran dihapus`);
    }

    const { error: pDelErr, count: pCount } = await supabaseAdmin
      .from('peserta')
      .delete({ count: 'exact' })
      .eq('gender', 'akhwat');
    if (pDelErr) throw pDelErr;
    log(`  · ${pCount ?? 0} row peserta dihapus`);
  }

  const { error: kDelErr, count: kCount } = await supabaseAdmin
    .from('kelas')
    .delete({ count: 'exact' })
    .eq('gender', 'akhwat');
  if (kDelErr) throw kDelErr;
  log(`  · ${kCount ?? 0} row kelas dihapus`);

  const { error: mDelErr, count: mCount } = await supabaseAdmin
    .from('musyrif')
    .delete({ count: 'exact' })
    .eq('gender', 'akhwat');
  if (mDelErr) throw mDelErr;
  log(`  · ${mCount ?? 0} row musyrif dihapus`);

  // ─── [3/5] Insert 5 musyrifah ────────────────────────────────────
  log('[3/5] Insert 5 musyrifah…');
  const musyrifByKelas = new Map<string, { id: string; name: string }>();
  for (const k of KELAS_AKHWAT) {
    const wa = normalizeWhatsApp(k.musyrif.wa);
    const { data, error } = await supabaseAdmin
      .from('musyrif')
      .insert({
        name: k.musyrif.name,
        gender: 'akhwat',
        whatsapp_number: wa,
        password_hash: hashMusyrif,
      })
      .select('id, name')
      .single();
    if (error) throw error;
    log(`  ✓ ${data.name} → ${k.name}`);
    musyrifByKelas.set(k.name, data);
  }

  // ─── [4/5] Insert 5 kelas akhwat ─────────────────────────────────
  log('[4/5] Insert 5 kelas akhwat…');
  const kelasIdByName = new Map<string, string>();
  for (const k of KELAS_AKHWAT) {
    const musyrif = musyrifByKelas.get(k.name)!;
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
    log(`  ✓ Kelas "${data.name}" (akhwat) — musyrifah: ${musyrif.name}`);
    kelasIdByName.set(k.name, data.id);
  }

  // ─── [5/5] Insert peserta akhwat ─────────────────────────────────
  log('[5/5] Insert peserta akhwat…');
  let totalPeserta = 0;
  for (const k of KELAS_AKHWAT) {
    const kelasId = kelasIdByName.get(k.name)!;
    const rows = k.peserta.map((p) => ({
      name: p.name,
      gender: 'akhwat' as const,
      kelas_id: kelasId,
      whatsapp_number: normalizeWhatsApp(p.wa),
      password_hash: hashPeserta,
    }));
    const { error } = await supabaseAdmin.from('peserta').insert(rows);
    if (error) throw error;
    log(`  ✓ ${k.name}: ${rows.length} peserta`);
    totalPeserta += rows.length;
  }

  log(`✓ Selesai. ${KELAS_AKHWAT.length} musyrifah, ${KELAS_AKHWAT.length} kelas, ${totalPeserta} peserta akhwat.`);
  log(`Default password musyrifah/koordinator: "${DEFAULT_PASSWORD_MUSYRIF}"`);
  log(`Default password peserta:               "${DEFAULT_PASSWORD_PESERTA}"`);
}
