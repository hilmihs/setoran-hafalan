/**
 * Seed data real: 5 kelas Maahir (Alif, Ba, Jim, Dal, Ha) — semua ikhwan.
 * WIPE data rekaman/setoran/peserta/kelas/musyrif lalu insert ulang.
 * Koordinator tidak disentuh.
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

const DEFAULT_PASSWORD = 'password123';

interface MusyrifEntry {
  name: string;
  wa: string;
}
interface KelasEntry {
  name: string;
  musyrif: MusyrifEntry;
  peserta: Array<{ name: string; wa: string }>;
}

const KELAS: KelasEntry[] = [
  {
    name: 'Alif',
    musyrif: { name: 'Faizil El Islami', wa: '81298205428' },
    peserta: [
      { name: 'Izha Richardinata', wa: '85934517467' },
      { name: 'Lalu Fauzul Azhim', wa: '85947384638' },
      { name: 'Pandite Agung Nasrianyar', wa: '87878874267' },
      { name: 'Saiful Idris', wa: '62895383372726' },
      { name: 'Syahrul Sani', wa: '85718003052' },
    ],
  },
  {
    name: 'Ba',
    musyrif: { name: 'Faisal Fajar', wa: '85271760094' },
    peserta: [
      { name: 'Adam Malik', wa: '81280630437' },
      { name: 'Fauzi Rahman', wa: '85719496131' },
      { name: 'Muhamad Abdul Rozaq', wa: '81282873891' },
      { name: 'Syafiq Muhammad', wa: '81293379047' },
      { name: 'Umar Abdul Aziz', wa: '82316993233' },
      { name: 'Qodriyanto Mukarim Damsuki', wa: '89674002335' },
      { name: 'Ilyas Fadhilah', wa: '82113614879' },
      { name: 'Usman Pati', wa: '81318607205' },
    ],
  },
  {
    name: 'Jim',
    musyrif: { name: 'Abdul Hakim Maula', wa: '82211162523' },
    peserta: [
      { name: 'Ahmad Syukri', wa: '87748055645' },
      { name: 'Dimas Raka', wa: '895375366456' },
      { name: 'Endrizon Sakban', wa: '85210113774' },
      { name: 'Ravi Hendrian', wa: '81219466698' },
      { name: 'Ridwan Rahmansyah', wa: '85723827937' },
    ],
  },
  {
    name: 'Dal',
    musyrif: { name: 'Muhammad Sofyan', wa: '82199266821' },
    peserta: [
      { name: 'Muhammad bin Jafar Diapari', wa: '81318484953' },
      { name: 'Muhammad Habibie', wa: '89506847572' },
      { name: 'Jawwad Rizqi Ridhatillah', wa: '81321757544' },
      { name: 'M. Redy Pranata', wa: '81363266831' },
      { name: 'Muhammad Ahlan Bestari', wa: '82113485342' },
      { name: 'Muhammad Rafli', wa: '895411843668' },
      { name: 'Aldi Salam', wa: '89633823389' },
      { name: 'Andi Razif', wa: '81938591581' },
    ],
  },
  {
    name: 'Ha',
    musyrif: { name: 'Muhammad Bintang Khairel', wa: '81275958605' },
    peserta: [
      { name: 'Abdurrahman bin Ruhendi', wa: '895331414036' },
      { name: 'Abdurrahman bin Ibrahim', wa: '85217836973' },
      { name: 'Ilman Nurdiansyah', wa: '89668612162' },
      { name: 'Muhammad Arief Abdillah', wa: '82345896101' },
      { name: 'Rahmadillah Utama', wa: '85174211072' },
      { name: 'Muhammad Hanif Al Hafiz', wa: '85363930728' },
      { name: 'Hammad Syakir', wa: '89531510494' },
      { name: 'Muhammad Faliqul Isbah', wa: '85278171545' },
      { name: 'Syamsunnas', wa: '81298727249' },
    ],
  },
];

export async function runSeedMaahir(log: (s: string) => void): Promise<void> {
  log('Hashing password default…');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  log('[1/4] Membersihkan data lama (rekaman, setoran, peserta, kelas, musyrif)…');
  await supabaseAdmin.from('rekaman').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('setoran').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('peserta').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('kelas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('musyrif').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  log('[2/4] Insert 5 musyrif…');
  const musyrifRows = KELAS.map((k) => ({
    name: k.musyrif.name,
    gender: 'ikhwan' as const,
    whatsapp_number: normalizeWhatsApp(k.musyrif.wa),
    password_hash: hash,
  }));
  const { data: musyrifInserted, error: mErr } = await supabaseAdmin
    .from('musyrif')
    .insert(musyrifRows)
    .select('id, name, whatsapp_number');
  if (mErr) throw mErr;

  const musyrifByName = new Map(musyrifInserted!.map((m) => [m.name, m]));
  musyrifInserted!.forEach((m) => log(`  ✓ ${m.name} (${m.whatsapp_number})`));

  log('[3/4] Insert 5 kelas…');
  const kelasRows = KELAS.map((k) => ({
    name: k.name,
    gender: 'ikhwan' as const,
    musyrif_id: musyrifByName.get(k.musyrif.name)!.id,
  }));
  const { data: kelasInserted, error: kErr } = await supabaseAdmin
    .from('kelas')
    .insert(kelasRows)
    .select('id, name');
  if (kErr) throw kErr;

  const kelasByName = new Map(kelasInserted!.map((k) => [k.name, k]));
  kelasInserted!.forEach((k) => log(`  ✓ Kelas ${k.name}`));

  log('[4/4] Insert peserta…');
  let totalPeserta = 0;
  for (const k of KELAS) {
    const kelasId = kelasByName.get(k.name)!.id;
    const rows = k.peserta.map((p) => ({
      name: p.name,
      gender: 'ikhwan' as const,
      kelas_id: kelasId,
      whatsapp_number: normalizeWhatsApp(p.wa),
    }));
    const { error: pErr } = await supabaseAdmin.from('peserta').insert(rows);
    if (pErr) throw pErr;
    log(`  ✓ Kelas ${k.name}: ${rows.length} peserta`);
    totalPeserta += rows.length;
  }

  log(`✓ Selesai. ${musyrifInserted!.length} musyrif, ${kelasInserted!.length} kelas, ${totalPeserta} peserta.`);
  log(`Default password semua musyrif: "${DEFAULT_PASSWORD}"`);
}
