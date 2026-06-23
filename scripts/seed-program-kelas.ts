/**
 * Seed kelas program Maahir (grouping kehadiran) + anggota.
 * Ketua/wakil identified by WA. Anggota di-link ke peserta by WA jika ada.
 *
 *   npx tsx scripts/seed-program-kelas.ts
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeWhatsApp } from '../src/lib/whatsapp';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Member = { name: string; wa: string; ketua?: boolean; wakil?: boolean };
type ProgramKelas = {
  name: string;
  gender: 'ikhwan' | 'akhwat';
  hari: string[];
  mulai: string;
  selesai: string;
  anggota: Member[];
};

const DATA: ProgramKelas[] = [
  // ============ AKHWAT ============
  {
    name: 'Maahir Takhassus Akhwat',
    gender: 'akhwat',
    hari: ['Selasa', 'Rabu', 'Kamis', "Jum'at"],
    mulai: '09:00', selesai: '11:30',
    anggota: [
      { name: 'Nur Hanifah', wa: '6285368377317' },
      { name: 'Salma', wa: '6282136573097', ketua: true },
      { name: 'Nur Afifah', wa: '82269092601' },
      { name: 'Radiatam Mardhiyah', wa: '81261306563' },
    ],
  },
  {
    name: 'Maahir Talaqqi (Senin pagi)',
    gender: 'akhwat',
    hari: ['Senin'],
    mulai: '09:00', selesai: '11:30',
    anggota: [
      { name: 'Salma Suhailah Nizzati', wa: '82131217655' },
      { name: 'Nafilatullatifah', wa: '85394650595', ketua: true },
      { name: 'Nyayu Safira Rahma', wa: '085964232366' },
      { name: 'Fatimah Azzahro', wa: '6287701502346' },
      { name: 'Nadiyah Alamanda', wa: '87889284677' },
      { name: 'Miftahul Amalia', wa: '82252660165' },
      { name: 'Zerina Br Singarimbun', wa: '85297464367' },
      { name: 'Lubna Rohmayanti', wa: '82339846513' },
    ],
  },
  {
    name: 'Maahir Talaqqi (Kamis pagi)',
    gender: 'akhwat',
    hari: ['Kamis'],
    mulai: '09:00', selesai: '11:30',
    anggota: [
      { name: 'Farha Sholihah', wa: '82249582671' },
      { name: 'Feni Damayanti', wa: '62895327649242', ketua: true },
      { name: 'Laila Safira', wa: '85211379646' },
      { name: 'Adhwa Khoirunnisa', wa: '81233271258' },
      { name: 'Siti Rohana', wa: '81358145992' },
      { name: 'Putri Chamelia Ulfah', wa: '85161428186' },
      { name: 'Fitria Khairunnisa', wa: '87840533822' },
      { name: 'Asiyah Annaajiyah', wa: '81615636276' },
      { name: 'Asri Dewi Lestari', wa: '87824132291' },
    ],
  },
  {
    name: 'Maahir Talaqqi (Senin siang)',
    gender: 'akhwat',
    hari: ['Senin'],
    mulai: '14:00', selesai: '17:30',
    anggota: [
      { name: 'Tasmiah Siti Salamah', wa: '895322125069' },
      { name: 'Annidaul Jannah', wa: '85788064547', ketua: true },
      { name: 'Ruqayyah', wa: '89653402400' },
      { name: 'Aulia Khairunnisa Mahbengi', wa: '8116800702' },
      { name: 'Salma Rifdatul Husna', wa: '81296978844' },
      { name: 'Nur Layla', wa: '89673092288' },
      { name: 'Umi Hidayati', wa: '81280683665' },
      { name: 'Wildatun Uyun', wa: '81353430149' },
    ],
  },
  {
    name: 'Maahir Talaqqi (Kamis siang)',
    gender: 'akhwat',
    hari: ['Kamis'],
    mulai: '14:00', selesai: '17:30',
    anggota: [
      { name: 'Nur Fidha Alifa', wa: '85710711676' },
      { name: 'Aisyah binti Muhammad', wa: '81374520890' },
      { name: 'Risa Afrianti', wa: '87751645069' },
      { name: 'Baiq Miftahul Husna', wa: '87855729712' },
      { name: 'Rafika Salma', wa: '85280159698' },
      { name: 'Siti Haerun Nisa Zain', wa: '85973281100', ketua: true },
      { name: 'Fanny Anastasiah', wa: '87728977800' },
    ],
  },
  {
    name: 'Maahir Talaqqi (Rabu siang)',
    gender: 'akhwat',
    hari: ['Rabu'],
    mulai: '14:00', selesai: '17:30',
    anggota: [
      { name: 'Dzakiyyah Rahmah', wa: '81344941255' },
      { name: 'Annisa Nurrahmah', wa: '89527038238' },
      { name: 'Cahlina Kinasih', wa: '87883985090' },
      { name: "Fathimah Fa'iqoh", wa: '81381855545', ketua: true },
      { name: 'Laura Rachima', wa: '81293559403' },
      { name: "Da'an Nurrayyan", wa: '8161355255' },
      { name: 'Fathia Alya', wa: '81281192703' },
    ],
  },
  {
    name: "Maahir Talaqqi (Jum'at siang)",
    gender: 'akhwat',
    hari: ["Jum'at"],
    mulai: '14:00', selesai: '17:30',
    anggota: [
      { name: 'Andi Hikmah Amaliyah', wa: '85157886962' },
      { name: 'Nabilla Putri Hasdar', wa: '85107012760', ketua: true },
      { name: 'Jesi Alya', wa: '82287440105' },
      { name: 'Atalika Khairunnisa', wa: '85797820878' },
      { name: 'Aulia Azizah', wa: '82337495351' },
      { name: 'Zulfa Masitoh', wa: '83103727282' },
      { name: 'Talida Jihan Nabila', wa: '81994771197' },
      { name: 'Putri Nur Sarjiari', wa: '85899409895' },
      { name: 'Nurul Azizah', wa: '81341334870' },
    ],
  },
  {
    name: 'Maahir Talaqqi (Kamis 14.15)',
    gender: 'akhwat',
    hari: ['Kamis'],
    mulai: '14:15', selesai: '16:00',
    anggota: [
      { name: 'Royhana Safira Pardiani', wa: '82391571790', ketua: true },
      { name: 'Putri Wahyuningsih', wa: '85215266117' },
      { name: 'Salma Khoiriyah', wa: '81904434357' },
      { name: 'Iin Dawani', wa: '81541551347' },
      { name: 'Silmi Muthmainnah', wa: '89517315052' },
      { name: 'Annisa Rizkya', wa: '82154905557' },
    ],
  },
  {
    name: 'Maahir 6A',
    gender: 'akhwat',
    hari: ['Senin', 'Kamis'],
    mulai: '09:00', selesai: '10:30',
    anggota: [
      { name: 'Aida Nur Faidah', wa: '82148674973' },
      { name: 'Muadzah Bawedan', wa: '85716426627' },
      { name: 'Maryam', wa: '89636759586' },
      { name: 'Aulia Tsabita', wa: '85161526371' },
      { name: 'Aisyah binti Ahmad', wa: '81903859552' },
      { name: 'Sri Sartika', wa: '85727659056' },
      { name: 'Assyiva Layla Ramadhani', wa: '87847419137', ketua: true },
      { name: 'Amanda Rahma Salsabila', wa: '87750576853' },
    ],
  },
  {
    name: 'Maahir 6B',
    gender: 'akhwat',
    hari: ['Senin', 'Kamis'],
    mulai: '12:30', selesai: '14:00',
    anggota: [
      { name: 'Annisa Jihan Zharifah', wa: '85313345346' },
      { name: 'Ratu Sabbih Bilhaqiqi', wa: '2316183538' },
      { name: 'Shikhatul Karimah', wa: '85842173587' },
      { name: "Afifah Al Ma'ruf", wa: '81936316219' },
      { name: 'Jenifier Imania Homalilo', wa: '81218744366' },
      { name: 'Hidayati', wa: '87762573826' },
      { name: 'Khansa Fauziah', wa: '89632449828' },
      { name: 'Padmiwati', wa: '85337702427' },
      { name: 'Amalia Sumayyah', wa: '882003564701' },
      { name: 'Shofiyyah Farah Hanifah', wa: '83834029512', ketua: true },
    ],
  },
  {
    name: 'Maahir 6C',
    gender: 'akhwat',
    hari: ['Senin', 'Kamis'],
    mulai: '07:30', selesai: '09:00',
    anggota: [
      { name: 'Sri Wulan Aprilia', wa: '88976050950' },
      { name: 'Nafa Nabila Hanum', wa: '85374773441' },
      { name: 'Siti Aisyah', wa: '81382494337' },
      { name: 'Frisca Yumiyanti', wa: '895371937301', ketua: true },
      { name: 'Aisyah Nuraini', wa: '81226596040' },
      { name: 'Stliem Putri Dwi', wa: '85753118814' },
      { name: 'Puan Cahyani H. Dasing', wa: '89601409692' },
      { name: 'Sulis Rizkina Syuda', wa: '81260708186' },
      { name: 'Durrotusyifa', wa: '85158944350' },
      { name: 'Fachira Rachman', wa: '81527614447' },
      { name: 'Aisyah Aulia Rohmah', wa: '88214726892' },
      { name: 'Rika Ramadhona', wa: '85373700618' },
      { name: 'Putri Ramadhani Austi', wa: '8992852672' },
      { name: 'Vita Oktaviani', wa: '081272958629' },
    ],
  },
  {
    name: 'Maahir 6D',
    gender: 'akhwat',
    hari: ['Senin', 'Kamis'],
    mulai: '12:30', selesai: '14:00',
    anggota: [
      { name: 'Hanifa Almutawakkil', wa: '82116296403' },
      { name: 'Nissa Andriani', wa: '81290931177' },
      { name: 'Sabaul Masani', wa: '87733558980', ketua: true },
      { name: 'Muthia Azzahra Sibuea', wa: '81362935896' },
      { name: 'Zakiyyah Muhdlori', wa: '85600648470' },
      { name: 'Safinatunnajah Azzahra', wa: '81292975010' },
      { name: "Shofaa' Muhdlori", wa: '85600648485' },
      { name: "Nawal Misy'al", wa: '82251892427' },
      { name: 'Nasya Alya Fahmida', wa: '85165693399' },
      { name: 'Rahmah Nadiyah', wa: '85721348894' },
    ],
  },

  // ============ IKHWAN ============
  {
    name: 'Maahir Takhassus Ikhwan',
    gender: 'ikhwan',
    hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at"],
    mulai: '16:00', selesai: '20:00',
    anggota: [
      { name: 'Ahmad Abdus Syukur', wa: '085822950406' },
      { name: 'Ahmad Syukri', wa: '087748055645' },
      { name: 'Muhammad Rifky Hanif', wa: '082383610606' },
      { name: 'Fishawar Fathan Madany', wa: '081384250868' },
      { name: 'Amal Rahmad', wa: '081359996023' },
      { name: 'Ibrahim Asadullah', wa: '081542328517', wakil: true },
      { name: 'Hilmi Hanif Sobandi', wa: '081399741809' },
      { name: 'Wildan Ismail', wa: '085846146221' },
      { name: 'Abdul Majid Aziz', wa: '0816997828', ketua: true },
      { name: 'Fatkhur Rohman Abdullah', wa: '085157120058' },
    ],
  },
  {
    name: "Maahir Tahfidzul Qur'an 1",
    gender: 'ikhwan',
    hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at"],
    mulai: '09:00', selesai: '11:30',
    anggota: [
      { name: 'Muhamad Abdul Rozaq', wa: '081282873891' },
      { name: 'Abdul Hakim Maula', wa: '082211162523', ketua: true },
      { name: 'Ilman Nurdiansyah', wa: '089668612162' },
      { name: 'Syafiq Muhammad', wa: '081293379047' },
    ],
  },
  {
    name: "Maahir Tahfidzul Qur'an 2",
    gender: 'ikhwan',
    hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at"],
    mulai: '14:30', selesai: '17:30',
    anggota: [
      { name: 'Abdul Hakim', wa: '081331732974' },
      { name: 'Muhammad Sofyan', wa: '082199266821' },
      { name: 'Muhammad Bintang Khairel', wa: '081275958605', ketua: true },
      { name: 'Arsiteno Rasendriya', wa: '081398229325' },
      { name: 'Muhammad Faliqul Isbah', wa: '085278171545' },
      { name: 'Alwan Hidayat', wa: '087723474742' },
      { name: 'Ibrahim Hanif Almuna', wa: '081584452809' },
      { name: 'Abdul Hamid', wa: '082260026262' },
      { name: 'Abdurrahman bin Ibrahim', wa: '085217836973' },
      { name: 'Andi Razif', wa: '081938591581' },
    ],
  },
  {
    name: 'Maahir Alumni/Talaqqi',
    gender: 'ikhwan',
    // Alumni talaqqi 1x/pekan, hari tidak fixed → tanpa jadwal harian.
    // Ketua input pertemuan manual saat talaqqi jalan (bukan wajib hadir tiap Senin–Jum'at).
    hari: [],
    mulai: '09:00', selesai: '21:00',
    anggota: [
      { name: 'Faizil El Islami', wa: '081298205428' },
      { name: 'Lalu Fauzul Azhim', wa: '085947384638' },
      { name: 'Pandite Agung Nasrianyar', wa: '087878874267' },
      { name: 'Saiful Idris', wa: '0895383372726' },
      { name: 'Adam Malik', wa: '081280630437' },
      { name: 'Faisal Fajar', wa: '085271760094' },
      { name: 'Fauzi Rahman', wa: '085719496131' },
      { name: 'Umar Abdul Aziz', wa: '082316993233' },
      { name: 'Qodriyanto Mukarim Damsuki', wa: '089674002335' },
      { name: 'Ilyas Fadhilah', wa: '082113614879' },
      { name: 'Usman Pati', wa: '081318607205' },
      { name: 'Dimas Raka', wa: '0895375366456' },
      { name: 'Endrizon Sakban', wa: '085210113774' },
      { name: 'Ravi Hendrian', wa: '081219466698' },
      { name: 'Ridwan Rahmansyah', wa: '085723827937' },
      { name: 'Muhammad bin Jafar Diapari', wa: '081318484953' },
      { name: 'Muhammad Habibie', wa: '089506847572' },
      { name: 'Jawwad Rizqi Ridhatillah', wa: '081321757544' },
      { name: 'M. Redy Pranata', wa: '081363266831' },
      { name: 'Muhammad Ahlan Bestari', wa: '082113485342', ketua: true },
      { name: 'Muhammad Rafli', wa: '0895411843668' },
      { name: 'Abdurrahman bin Ruhendi', wa: '0895331414036' },
      { name: 'Muhammad Arief Abdillah', wa: '082345896101' },
      { name: 'Rahmadillah Utama', wa: '085174211072' },
      { name: 'Muhammad Hanif Al Hafiz', wa: '085363930728' },
      { name: 'Hammad Syakir', wa: '089531510494' },
      { name: 'Aldi Salam', wa: '089633823389' },
      { name: 'Syamsunnas', wa: '081298727249' },
      { name: 'Daffa Prayoga', wa: '085780519381' },
      { name: 'Muhammad Sofyan', wa: '082199266821', wakil: true },
    ],
  },
  {
    name: 'Maahir Lanjutan Intensif',
    gender: 'ikhwan',
    hari: ['Selasa', 'Kamis'],
    mulai: '19:30', selesai: '21:00',
    anggota: [
      { name: 'Abdullah Mubarak Al Habsyi', wa: '085718965202' },
      { name: 'Arsiteno Rasendriya', wa: '081398229325' },
      { name: 'Abdul Hamid', wa: '082260026262', ketua: true },
      { name: 'Abdul Hakim', wa: '081331732974' },
      { name: 'Daffa Prayoga', wa: '085780519381' },
      { name: 'Rozul Setiawan', wa: '087755220260' },
      { name: 'Alwan Hidayat', wa: '087723474742' },
      { name: 'Ibrahim Hanif Almuna', wa: '081584452809' },
    ],
  },
];

async function main() {
  // Lookup peserta by normalized WA
  const { data: allPeserta, error: pErr } = await supabaseAdmin
    .from('peserta')
    .select('id, name, whatsapp_number')
    .eq('active', true);
  if (pErr) throw pErr;
  const pesertaByWa = new Map<string, string>();
  for (const p of allPeserta ?? []) {
    pesertaByWa.set(normalizeWhatsApp(p.whatsapp_number), p.id);
  }

  let totalAnggota = 0;
  let matched = 0;

  for (const pk of DATA) {
    const ketua = pk.anggota.find((a) => a.ketua);
    const wakil = pk.anggota.find((a) => a.wakil);

    const { data: upserted, error: kErr } = await supabaseAdmin
      .from('program_kelas')
      .upsert(
        {
          name: pk.name,
          gender: pk.gender,
          jadwal_hari: pk.hari,
          waktu_mulai: pk.mulai,
          waktu_selesai: pk.selesai,
          ketua_wa: ketua ? normalizeWhatsApp(ketua.wa) : null,
          wakil_wa: wakil ? normalizeWhatsApp(wakil.wa) : null,
        },
        { onConflict: 'name' }
      )
      .select('id')
      .single();
    if (kErr || !upserted) throw kErr ?? new Error(`upsert gagal: ${pk.name}`);

    for (const a of pk.anggota) {
      const wa = normalizeWhatsApp(a.wa);
      const pesertaId = pesertaByWa.get(wa) ?? null;
      if (pesertaId) matched++;
      totalAnggota++;
      const { error: aErr } = await supabaseAdmin
        .from('program_kelas_anggota')
        .upsert(
          {
            program_kelas_id: upserted.id,
            peserta_id: pesertaId,
            name: a.name,
            whatsapp_number: wa,
            is_ketua: !!a.ketua,
            is_wakil: !!a.wakil,
          },
          { onConflict: 'program_kelas_id,whatsapp_number' }
        );
      if (aErr) throw new Error(`anggota ${a.name} (${pk.name}): ${aErr.message}`);
    }

    console.log(`✓ ${pk.name} — ${pk.anggota.length} anggota, ketua: ${ketua?.name ?? '—'}`);
  }

  console.log(`\nSelesai. ${DATA.length} kelas, ${totalAnggota} anggota (${matched} match akun peserta).`);
}

main().catch((err) => {
  console.error('✗ Error:', err);
  process.exit(1);
});
