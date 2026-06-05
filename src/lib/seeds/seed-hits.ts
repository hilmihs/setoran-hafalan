/**
 * Seed data HITS: kelompok pengajar, koordinator, program kehadiran.
 * WIPE semua data HITS lalu insert ulang.
 * Password default: "hits123"
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

const PWD = 'hits123';
type G = 'ikhwan' | 'akhwat';

interface KelompokData {
  name: string;
  gender: G;
  ketua: { name: string; wa: string };
  anggota: { name: string; wa: string }[];
}

const IKHWAN_KELOMPOK: KelompokData[] = [
  {
    name: 'Kelompok 1 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Muhammad Rifky Hanif', wa: '82383610606' },
    anggota: [
      { name: 'Faizil El Islami', wa: '81298205428' },
      { name: 'Lalu Fauzul Azhim', wa: '085947384638' },
      { name: 'Pandite Agung Nasrianyar', wa: '87878874267' },
      { name: 'Saiful Idris', wa: '0895383372726' },
      { name: 'Faisal Fajar', wa: '085271760094' },
      { name: 'Muhamad Abdul Rozaq', wa: '081282873891' },
      { name: 'Syafiq Muhammad', wa: '081293379047' },
    ],
  },
  {
    name: 'Kelompok 2 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Ahmad Syukri', wa: '87748055645' },
    anggota: [
      { name: 'Umar Abdul Aziz', wa: '082316993233' },
      { name: 'Ilyas Fadhilah', wa: '082113614879' },
      { name: 'Usman Pati', wa: '081318607205' },
      { name: 'Dimas Raka', wa: '0895375366456' },
      { name: 'Endrizon Sakban', wa: '085210113774' },
      { name: 'Ridwan Rahmansyah', wa: '85723827937' },
      { name: 'Muhammad bin Jafar Diapari', wa: '081318484953' },
    ],
  },
  {
    name: 'Kelompok 3 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Adam Malik', wa: '81280630437' },
    anggota: [
      { name: 'Jawwad Rizqi Ridhatillah', wa: '81321757544' },
      { name: 'M. Redy Pranata', wa: '081363266831' },
      { name: 'Muhammad Ahlan Bestari', wa: '082113485342' },
      { name: 'Muhammad Rafli', wa: '0895411843668' },
      { name: 'Abdurrahman bin Ruhendi', wa: '0895331414036' },
      { name: 'Abdurrahman bin Ibrahim', wa: '085217836973' },
      { name: 'Ilman Nurdiansyah', wa: '089668612162' },
    ],
  },
  {
    name: 'Kelompok 4 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Abdul Hakim Maula', wa: '82211162523' },
    anggota: [
      { name: 'Muhammad Arief Abdillah', wa: '082345896101' },
      { name: 'Rahmadillah Utama', wa: '085174211072' },
      { name: 'Muhammad Hanif Al Hafiz', wa: '085363930728' },
      { name: 'Hammad Syakir', wa: '089531510494' },
      { name: 'Muhammad Faliqul Isbah', wa: '085278171545' },
      { name: 'Aldi Salam', wa: '089633823389' },
      { name: 'Andi Razif', wa: '081938591581' },
    ],
  },
  {
    name: 'Kelompok 5 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Muhammad Sofyan', wa: '82199266821' },
    anggota: [
      { name: 'Syamsunnas', wa: '081298727249' },
      { name: 'Fishawar Fathan Madany', wa: '81384250868' },
      { name: 'Amal Rahmad', wa: '081359996023' },
      { name: 'Ibrahim Asadullah', wa: '81542328517' },
      { name: 'Hilmi Hanif Sobandi', wa: '081399741809' },
      { name: 'Wildan Ismail', wa: '85846146221' },
      { name: 'Arsiteno Rasendriya', wa: '081398229325' },
      { name: 'Abdul Majid Aziz', wa: '0816997828' },
    ],
  },
  {
    name: 'Kelompok 6 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Muhammad Bintang Khairel', wa: '81275958605' },
    anggota: [
      { name: 'Abdullah Mubarak Al Habsyi', wa: '085718965202' },
      { name: 'Abdul Hamid', wa: '082260026262' },
      { name: 'Daffa Prayoga', wa: '081584452809' },
      { name: 'Ibrahim Hanif Almuna', wa: '085780519381' },
      { name: 'Abdul Hakim', wa: '081331732974' },
      { name: 'Mudabbir', wa: '087864609603' },
      { name: 'Rozul Setiawan', wa: '087755220260' },
      { name: 'Muhamad Kholid Alfad', wa: '082188771949' },
    ],
  },
];

const AKHWAT_KELOMPOK: KelompokData[] = [
  {
    name: 'Kelompok 1 Akhwat', gender: 'akhwat',
    ketua: { name: 'Andi Hikmah Amaliyah', wa: '085157886962' },
    anggota: [
      { name: 'Jesi Alya', wa: '082287440105' },
      { name: 'Nur Fidha Alifa', wa: '085710711676' },
      { name: 'Nur Layla', wa: '089673092288' },
      { name: 'Miftahul Amalia', wa: '082252660165' },
      { name: 'Asiyah Annaajiyah', wa: '081615636276' },
      { name: 'Annisa Jihan Zharifah', wa: '085313345346' },
      { name: 'Sri Sartika', wa: '085727659056' },
      { name: 'Silmi Muthmainnah', wa: '089517315052' },
    ],
  },
  {
    name: 'Kelompok 2 Akhwat', gender: 'akhwat',
    ketua: { name: 'Annidaul Jannah', wa: '085788064547' },
    anggota: [
      { name: 'Fathia Ramadhita', wa: '081959442869' },
      { name: "Fathimah Fa'iqoh", wa: '081381855545' },
      { name: 'Feni Damayanti', wa: '0895327649242' },
      { name: 'Fathia Alya', wa: '081281192703' },
      { name: 'Sri Wulan Aprilia', wa: '08976050950' },
      { name: 'Sulis Rizkina Syuda', wa: '081260708186' },
      { name: "Shofaa' Muhdlori", wa: '085600648485' },
      { name: 'Nyayu Safira Rahma', wa: '085964232366' },
    ],
  },
  {
    name: 'Kelompok 3 Akhwat', gender: 'akhwat',
    ketua: { name: 'Umi Hidayati', wa: '081280683665' },
    anggota: [
      { name: 'Azzahra Karimah', wa: '085265538861' },
      { name: 'Azzah Tsabita Maharani Piliang', wa: '085813445370' },
      { name: 'Siti Rohana', wa: '081358145992' },
      { name: 'Puteri Chamelia Ulfah', wa: '085161428186' },
      { name: 'Aisyah binti Ahmad', wa: '081903859552' },
      { name: 'Shikhatul Karimah', wa: '085842173587' },
      { name: 'Nafa Nabila Hanum', wa: '085374773441' },
      { name: 'Fachira Rachman', wa: '081527614447' },
    ],
  },
  {
    name: 'Kelompok 4 Akhwat', gender: 'akhwat',
    ketua: { name: 'Nabilla Putri Hasdar', wa: '085107012760' },
    anggota: [
      { name: 'Nurul Nabilah Azhar', wa: '082123757239' },
      { name: 'Adhwa Khoirunnisa', wa: '081233271258' },
      { name: 'Annisa Nurrahmah', wa: '089527038238' },
      { name: 'Laila Safira', wa: '085211379646' },
      { name: 'Aulia Azizah', wa: '082337495351' },
      { name: 'Hidayati', wa: '087762573826' },
      { name: 'Puan Cahyani H. Dasing', wa: '089601409692' },
    ],
  },
  {
    name: 'Kelompok 5 Akhwat', gender: 'akhwat',
    ketua: { name: 'Lubna Rohmayanti', wa: '082339846513' },
    anggota: [
      { name: 'Ruqayyah', wa: '089653402400' },
      { name: 'Istiqomah Islamiyah', wa: '081382819973' },
      { name: 'Arisatul Lailin Nikmah', wa: '081266991539' },
      { name: 'Salma Khoiriyah', wa: '081904434357' },
      { name: 'Laura Rachima', wa: '081293559403' },
      { name: 'Assyiva Layla Ramadhani', wa: '087847419137' },
      { name: 'Padmiwati', wa: '085337702427' },
      { name: 'Siti Aisyah', wa: '081382494337' },
    ],
  },
  {
    name: 'Kelompok 6 Akhwat', gender: 'akhwat',
    ketua: { name: 'Aulia Khairunnisa Mahbeng', wa: '08116800702' },
    anggota: [
      { name: 'Sabaul Masani', wa: '087733558980' },
      { name: 'Ismi Khoiriyah', wa: '085784824142' },
      { name: 'Anisah Dzakirah', wa: '081370792041' },
      { name: 'Putri Wahyuningsih', wa: '085215266117' },
      { name: 'Fanny Anastasiah', wa: '087728977800' },
      { name: 'Zerina Br Singarimbun', wa: '085297464367' },
      { name: 'Aisyah binti Muhammad', wa: '081374520890' },
      { name: "Afifah Al Ma'ruf", wa: '081936316219' },
    ],
  },
  {
    name: 'Kelompok 7 Akhwat', gender: 'akhwat',
    ketua: { name: 'Rafika Salma', wa: '085280159698' },
    anggota: [
      { name: 'Muthia Azzahra Sibuea', wa: '081362935896' },
      { name: 'Humaira Sari', wa: '089531610183' },
      { name: 'Fatimah Azzahro', wa: '087701502346' },
      { name: 'Baiq Miftahul Husna', wa: '087855729712' },
      { name: 'Dzakiyyah Rahmah', wa: '081344941255' },
      { name: 'Royhana Safira Pardiani', wa: '082391571790' },
      { name: 'Atikah Az Zahwa', wa: '083143228400' },
      { name: 'Zakia Annajah', wa: '082137600976' },
    ],
  },
  {
    name: 'Kelompok 8 Akhwat', gender: 'akhwat',
    ketua: { name: 'Risa Afrianti', wa: '087751645069' },
    anggota: [
      { name: 'Frisca Yumiyanti', wa: '0895371937301' },
      { name: 'Nasya Alya Fahmida', wa: '085165693399' },
      { name: 'Farha Sholihah', wa: '082249582671' },
      { name: 'Khasyi Hania Nataprawira', wa: '081310696660' },
      { name: 'Iin Dawani', wa: '081541551347' },
      { name: 'Asri Dewi Lestari', wa: '087824132291' },
      { name: 'Salma Suhailah Nizzati', wa: '082131217655' },
      { name: 'Amanda Rahma Salsabila', wa: '087750576853' },
    ],
  },
  {
    name: 'Kelompok 9 Akhwat', gender: 'akhwat',
    ketua: { name: 'Talida Jihan Nabila', wa: '081994771197' },
    anggota: [
      { name: 'Khansa Fauziah', wa: '089632449828' },
      { name: 'Cahlina Kinasih', wa: '087883985090' },
      { name: 'Siti Haerun Nisa Zain', wa: '085973281100' },
      { name: 'Sora Arya Pitaloka', wa: '081347254263' },
      { name: 'Aida Nur Faidah', wa: '082148674973' },
      { name: 'Muadzah Bawedan', wa: '085716426627' },
      { name: 'Jenifier Imania Homalilo', wa: '081218744366' },
      { name: 'Vita Oktaviani', wa: '081272958629' },
    ],
  },
  {
    name: 'Kelompok 10 Akhwat', gender: 'akhwat',
    ketua: { name: 'Nurul Azizah', wa: '081341334870' },
    anggota: [
      { name: 'Aisyah Aulia Rohmah', wa: '088214726892' },
      { name: 'Hanifa Almutawakkil', wa: '082116296403' },
      { name: 'Ahilla Hamra Zahratul Islam', wa: '087879528389' },
      { name: 'Maryam', wa: '089636759586' },
      { name: 'Aulia Tsabita', wa: '085161526371' },
      { name: 'Aisyah Nuraini', wa: '081226596040' },
    ],
  },
  {
    name: 'Kelompok 11 Akhwat', gender: 'akhwat',
    ketua: { name: 'Salma Rifdatul Husna', wa: '081296978844' },
    anggota: [
      { name: 'Amalia Sumayyah', wa: '0882003564701' },
      { name: 'Stliem Putri Dwi', wa: '085753118814' },
      { name: 'Nissa Andriani', wa: '081290931177' },
      { name: 'Nidya Haafizhah Shafa', wa: '081315059004' },
      { name: "Da'an Nurrayyan", wa: '08161355255' },
      { name: 'Safinatunnajah Azzahra', wa: '081292975010' },
      { name: 'Zulfa Masitoh', wa: '083103727282' },
    ],
  },
  {
    name: 'Kelompok 12 Akhwat', gender: 'akhwat',
    ketua: { name: 'Tasmiah Siti Salamah', wa: '0895322125069' },
    anggota: [
      { name: 'Fitria Khairunnisa', wa: '087840533822' },
      { name: 'Shofiyyah Farah Hanifah', wa: '083834029512' },
      { name: 'Putri Nur Sarjiari', wa: '085899409895' },
      { name: 'Rahmah Nadiyah', wa: '085721348894' },
      { name: 'Nadiyah Alamanda', wa: '087889284677' },
      { name: 'Nafilatullatifah', wa: '085394650595' },
      { name: "Nawal Misy'al", wa: '082251892427' },
    ],
  },
  {
    name: 'Kelompok 13 Akhwat', gender: 'akhwat',
    ketua: { name: 'Atalika Khairunnisa', wa: '085797820878' },
    anggota: [
      { name: 'Ratu Sabbih Bilhaqiqi', wa: '082316183538' },
      { name: 'Durrotusyifa', wa: '085158944350' },
      { name: 'Zakiyyah Muhdlori', wa: '085600648470' },
      { name: 'Putri Ramadhani Austi', wa: '08992852672' },
      { name: 'Annisa Rizkya', wa: '082154905557' },
      { name: 'Hanifah Adiani', wa: '083161052795' },
      { name: 'Nidaul Khusna', wa: '083817300090' },
      { name: 'Rosi Gusmulia', wa: '085697570249' },
    ],
  },
];

const ALL_KELOMPOK = [...IKHWAN_KELOMPOK, ...AKHWAT_KELOMPOK];

const KOORDINATOR_HITS = [
  { name: 'Abdul Muhsin', gender: 'ikhwan' as G, wa: '+62 812-8067-2014' },
  { name: 'Ahmad Abdus Syukur', gender: 'ikhwan' as G, wa: '085822950406' },
  { name: 'Salma', gender: 'akhwat' as G, wa: '+62 821-3657-3097' },
  { name: 'Wildatun Uyun', gender: 'akhwat' as G, wa: '+62 813-5343-0149' },
  { name: 'Radiatam Mardhiyah', gender: 'akhwat' as G, wa: '+62 812-6130-6563' },
];

const KOORDINATOR_KK = [
  { name: 'Koordinator KK Ikhwan', gender: 'ikhwan' as G, wa: '+62 812-8063-0437' },
  { name: 'Koordinator KK Akhwat', gender: 'akhwat' as G, wa: '+62 878-7361-1753' },
];

const PROGRAMS = [
  { name: 'Kajian At-Tibyan', hari: ['sabtu'], waktu_mulai: '08:45', waktu_selesai: '10:00' },
  { name: 'Program Muallim Najih', hari: ['jumat'], waktu_mulai: '19:30', waktu_selesai: '20:30' },
];

const NIL = '00000000-0000-0000-0000-000000000000';
const del = (table: string) => supabaseAdmin.from(table).delete().neq('id', NIL);

export async function runSeedHits(log: (s: string) => void) {
  log('Hashing password default…');
  const hash = await bcrypt.hash(PWD, 12);

  // -- Preserve superadmin records --
  const { data: existingKoorHits } = await supabaseAdmin
    .from('koordinator_hits')
    .select('name, gender, whatsapp_number, password_hash')
    .not('whatsapp_number', 'in', `(${KOORDINATOR_HITS.map(k => normalizeWhatsApp(k.wa)).join(',')})`);
  const { data: existingKoorKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('name, gender, whatsapp_number, password_hash')
    .not('whatsapp_number', 'in', `(${KOORDINATOR_KK.map(k => normalizeWhatsApp(k.wa)).join(',')})`);

  log('Membersihkan data HITS lama…');
  await del('audit_log');
  await del('matrix_rekap');
  await del('teguran');
  await del('jadwal_pindah');
  await del('tabayyun');
  await del('observasi_kelas');
  await del('libur_program');
  await del('pengajuan_alasan');
  await del('checkin_pengajar');
  await del('penilaian_pedagogis');
  await del('penilaian_masyaikh');
  await del('ketua_kelas');
  await del('kelas_hits');
  await del('pengajar');
  await del('kelompok_pengajar');
  await del('koordinator_ketua_kelas');
  await del('koordinator_hits');
  await del('program_kehadiran');
  log('✓ Bersih');

  // -- Program Kehadiran --
  const { data: progs, error: progErr } = await supabaseAdmin
    .from('program_kehadiran')
    .insert(PROGRAMS.map((p) => ({ ...p, active: true })))
    .select('id, name');
  if (progErr) throw progErr;
  log(`✓ ${progs!.length} program kehadiran`);

  // -- Koordinator HITS --
  const { data: koorHits, error: khErr } = await supabaseAdmin
    .from('koordinator_hits')
    .insert(KOORDINATOR_HITS.map((k) => ({
      name: k.name,
      gender: k.gender,
      whatsapp_number: normalizeWhatsApp(k.wa),
      password_hash: hash,
    })))
    .select('id, name, gender');
  if (khErr) throw khErr;
  log(`✓ ${koorHits!.length} koordinator HITS`);

  // Re-insert preserved superadmin koordinator_hits
  if (existingKoorHits && existingKoorHits.length > 0) {
    const { error } = await supabaseAdmin.from('koordinator_hits').insert(existingKoorHits);
    if (!error) log(`✓ ${existingKoorHits.length} koordinator HITS tambahan di-restore`);
  }

  // -- Koordinator Ketua Kelas --
  const { data: koorKK, error: kkErr } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .insert(KOORDINATOR_KK.map((k) => ({
      name: k.name,
      gender: k.gender,
      whatsapp_number: normalizeWhatsApp(k.wa),
      password_hash: hash,
    })))
    .select('id, name, gender');
  if (kkErr) throw kkErr;
  log(`✓ ${koorKK!.length} koordinator KK`);

  // Re-insert preserved superadmin koordinator_ketua_kelas
  if (existingKoorKK && existingKoorKK.length > 0) {
    const { error } = await supabaseAdmin.from('koordinator_ketua_kelas').insert(existingKoorKK);
    if (!error) log(`✓ ${existingKoorKK.length} koordinator KK tambahan di-restore`);
  }

  // -- Kelompok & Pengajar --
  const seenWa = new Set<string>();
  let totalPengajar = 0;

  for (const kel of ALL_KELOMPOK) {
    const { data: kelRow, error: kelErr } = await supabaseAdmin
      .from('kelompok_pengajar')
      .insert({ name: kel.name, gender: kel.gender })
      .select('id')
      .single();
    if (kelErr) throw kelErr;
    const kelompokId = kelRow.id;

    const rows: {
      name: string;
      gender: G;
      whatsapp_number: string;
      password_hash: string;
      kelompok_id: string;
      is_ketua: boolean;
    }[] = [];

    const ketuaWa = normalizeWhatsApp(kel.ketua.wa);
    if (!seenWa.has(ketuaWa)) {
      seenWa.add(ketuaWa);
      rows.push({
        name: kel.ketua.name, gender: kel.gender,
        whatsapp_number: ketuaWa, password_hash: hash,
        kelompok_id: kelompokId, is_ketua: true,
      });
    }

    for (const a of kel.anggota) {
      const wa = normalizeWhatsApp(a.wa);
      if (seenWa.has(wa)) {
        log(`  ⚠ Skip duplikat: ${a.name} (${wa})`);
        continue;
      }
      seenWa.add(wa);
      rows.push({
        name: a.name, gender: kel.gender,
        whatsapp_number: wa, password_hash: hash,
        kelompok_id: kelompokId, is_ketua: false,
      });
    }

    if (rows.length > 0) {
      const { error: pErr } = await supabaseAdmin.from('pengajar').insert(rows);
      if (pErr) throw pErr;
      totalPengajar += rows.length;
    }
    log(`✓ ${kel.name} (${rows.length} pengajar)`);
  }
  log(`Total: ${totalPengajar} pengajar`);

  // -- Demo checkin data --
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const { data: somePengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id')
    .eq('gender', 'ikhwan')
    .limit(4);

  const tibyanId = progs!.find((p) => p.name === 'Kajian At-Tibyan')?.id;
  const muallimId = progs!.find((p) => p.name === 'Program Muallim Najih')?.id;

  if (somePengajar && somePengajar.length >= 3 && tibyanId && muallimId) {
    const checkins = [
      { pengajar_id: somePengajar[0].id, program_id: tibyanId, tanggal: yesterday, status: 'hadir', is_terlambat: false },
      { pengajar_id: somePengajar[1].id, program_id: tibyanId, tanggal: yesterday, status: 'hadir', is_terlambat: true },
      { pengajar_id: somePengajar[2].id, program_id: tibyanId, tanggal: yesterday, status: 'izin', is_terlambat: false },
      { pengajar_id: somePengajar[0].id, program_id: muallimId, tanggal: yesterday, status: 'hadir', is_terlambat: false },
      { pengajar_id: somePengajar[1].id, program_id: muallimId, tanggal: yesterday, status: 'sakit', is_terlambat: false },
    ];
    const { error: ciErr } = await supabaseAdmin.from('checkin_pengajar').insert(checkins);
    if (ciErr) log(`⚠ Checkin error: ${ciErr.message}`);
    else log(`✓ ${checkins.length} demo checkin`);

    const alasan = [
      {
        pengajar_id: somePengajar[1].id, program_id: tibyanId,
        tanggal: yesterday, jenis: 'terlambat',
        alasan: 'Macet di jalan, sudah berangkat dari rumah tepat waktu.',
        status: 'pending',
      },
      {
        pengajar_id: somePengajar[2].id, program_id: tibyanId,
        tanggal: yesterday, jenis: 'alpa',
        alasan: 'Ada keperluan keluarga mendadak yang tidak bisa ditunda.',
        status: 'accepted',
        decided_by: somePengajar[0].id,
        decided_at: new Date().toISOString(),
      },
    ];
    const { error: aErr } = await supabaseAdmin.from('pengajuan_alasan').insert(alasan);
    if (aErr) log(`⚠ Alasan error: ${aErr.message}`);
    else log(`✓ ${alasan.length} demo pengajuan alasan`);
  }

  // Demo libur
  const nextSaturday = new Date();
  nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay() + 7) % 7 || 7));
  const saturdayStr = nextSaturday.toISOString().slice(0, 10);

  if (tibyanId && koorHits) {
    const { error: libErr } = await supabaseAdmin.from('libur_program').insert({
      program_id: tibyanId,
      tanggal: saturdayStr,
      keterangan: 'Libur demo — Kajian At-Tibyan ditiadakan',
      created_by_id: koorHits[0].id,
    });
    if (libErr) log(`⚠ Libur error: ${libErr.message}`);
    else log(`✓ 1 demo libur (${saturdayStr})`);
  }

  log(`Password default semua akun HITS: "${PWD}"`);
}
