import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

const PWD = 'hits123';
type G = 'ikhwan' | 'akhwat';

interface KelasData {
  name: string;
  pengajar: string;
  gender: G;
  status: 'online' | 'offline';
  ketua: string;
  ketuaWa: string;
}

const NAME_MAP: Record<string, string> = {
  'Muhammad Hanif Alhafiz': 'Muhammad Hanif Al Hafiz',
  'Hilmi Hanif Soebandi': 'Hilmi Hanif Sobandi',
  'Muhamad Rafli': 'Muhammad Rafli',
  'Lalu Muhammad Fauzul Azhim': 'Lalu Fauzul Azhim',
  'Muhammad bin Japar Diapari': 'Muhammad bin Jafar Diapari',
  'Adam Malik Nurzuhdi': 'Adam Malik',
  'Annida Uljannah': 'Annidaul Jannah',
  'Zulfah Masitoh': 'Zulfa Masitoh',
  'Salma Khoiriyyah': 'Salma Khoiriyah',
  'Lalu M Saipul Idris': 'Saiful Idris',
  "Fathimah Fa'iqoh": "Fathimah Fa'iqoh",
};

const IKHWAN_KELAS: KelasData[] = [
  { name: 'HITS Pria Juni 2025 01', pengajar: 'Andi Razif', gender: 'ikhwan', status: 'online', ketua: 'Yudit', ketuaWa: '6282119119441' },
  { name: 'HITS Pria Juni 2025 02', pengajar: 'Abdurrahman', gender: 'ikhwan', status: 'online', ketua: 'Ismunandar', ketuaWa: '6285340182327' },
  { name: 'HITS Pria Juni 2025 03', pengajar: 'Muhammad Hanif Alhafiz', gender: 'ikhwan', status: 'online', ketua: 'Muhammad Nur Hidayat', ketuaWa: '6289615282344' },
  { name: 'HITS Pria Juni 2025 04', pengajar: 'Ahmad Abdus Syukur', gender: 'ikhwan', status: 'online', ketua: 'Aprilianus Valentino', ketuaWa: '6285814894913' },
  { name: 'HITS Pria Juni 2025 05', pengajar: 'Aldi Salam', gender: 'ikhwan', status: 'online', ketua: 'Yoga Supriyatna', ketuaWa: '6289505076320' },
  { name: 'HITS Pria Juni 2025 06', pengajar: 'Hilmi Hanif Soebandi', gender: 'ikhwan', status: 'online', ketua: 'Wawan Gunawan', ketuaWa: '6282146898982' },
  { name: 'HITS Pria Juni 2025 08', pengajar: 'Qodriyanto', gender: 'ikhwan', status: 'online', ketua: 'Panji Krisna', ketuaWa: '628111230601' },
  { name: 'HITS Pria Juni 2025 09', pengajar: 'Endrizon Sakban', gender: 'ikhwan', status: 'online', ketua: 'Yulaili Taufan', ketuaWa: '628121010117' },
  { name: 'HITS Pria Juni 2025 10', pengajar: 'Faisal Fajar', gender: 'ikhwan', status: 'online', ketua: 'Afiq Al Ayyubi', ketuaWa: '6281218590412' },
  { name: 'HITS Pria Juni 2025 14', pengajar: 'Ilyas Fadhilah', gender: 'ikhwan', status: 'online', ketua: 'Imanuel Hendarto', ketuaWa: '628558403622' },
  { name: 'HITS Pria Juni 2025 15', pengajar: 'Ilyas Fadhilah', gender: 'ikhwan', status: 'online', ketua: 'Triyadi Abu Hoshii', ketuaWa: '6281395712031' },
  { name: 'HITS Pria Juni 2025 16', pengajar: 'Ridwan Rahmansyah', gender: 'ikhwan', status: 'online', ketua: 'Farouk Arief M', ketuaWa: '62811552030' },
  { name: 'HITS Pria Juni 2025 17', pengajar: 'Muhamad Rafli', gender: 'ikhwan', status: 'online', ketua: 'Bobby Rachmat F', ketuaWa: '6285729096900' },
  { name: 'HITS Pria Juni 2025 18', pengajar: 'Lalu M Saipul Idris', gender: 'ikhwan', status: 'online', ketua: 'Robby Salahuddin', ketuaWa: '6282228850137' },
  { name: 'HITS Pria Juni 2025 19', pengajar: 'Lalu Muhammad Fauzul Azhim', gender: 'ikhwan', status: 'online', ketua: 'Muhammad Ridwansyah', ketuaWa: '6281253694621' },
  { name: 'HITS Pria Juni 2025 20', pengajar: 'Muhammad bin Japar Diapari', gender: 'ikhwan', status: 'online', ketua: 'Hadi Aris Wijatmiko', ketuaWa: '6289654473787' },
  { name: 'HITS Pria Juni 2025 21', pengajar: 'Rahmadillah Utama', gender: 'ikhwan', status: 'online', ketua: 'Prima Wuryanjono', ketuaWa: '628111110040' },
  { name: 'HITS Pria Juni 2025 23', pengajar: 'Umar Abdul Aziz', gender: 'ikhwan', status: 'online', ketua: 'Srihadi Susilo', ketuaWa: '628119749150' },
  { name: 'HITS Pria Juni 2025 26', pengajar: 'Zubair Bin Jasnur', gender: 'ikhwan', status: 'online', ketua: 'Aan Mulyana', ketuaWa: '6281214122131' },
  { name: 'HITS Pria Juni 2025 27', pengajar: 'Muhammad Ahlan Bestari', gender: 'ikhwan', status: 'online', ketua: 'Saiful Amri', ketuaWa: '6281310353028' },
  { name: 'HITS Pria Juni 2025 30', pengajar: 'Muhammad Arief Abdillah', gender: 'ikhwan', status: 'online', ketua: 'Maruli Simanungkalit', ketuaWa: '628121001020' },
  { name: 'HITS Pria Juni 2025 31', pengajar: 'Rifqi Abdurrahman', gender: 'ikhwan', status: 'online', ketua: 'Tedi Agung Prabowo', ketuaWa: '628121056001' },
  { name: 'HITS Pria Juni 2025 32', pengajar: 'Ridwan Rahmansyah', gender: 'ikhwan', status: 'online', ketua: 'David', ketuaWa: '628111041789' },
  { name: 'HITS Pria Juni 2025 36', pengajar: 'Muhammad Rifky Hanif', gender: 'ikhwan', status: 'online', ketua: 'Henra', ketuaWa: '6282153523238' },
  { name: 'HITS Pria Juni 2025 56', pengajar: 'Muhammad Sofyan', gender: 'ikhwan', status: 'offline', ketua: 'Rohmansyah', ketuaWa: '628998133438' },
  { name: 'HITS Pria Juni 2025 57', pengajar: 'Ahmad Syukri', gender: 'ikhwan', status: 'offline', ketua: 'Achmad Qaulan Sadiida Siregar', ketuaWa: '6282166526245' },
  { name: 'HITS Pria Juni 2025 59', pengajar: 'Syafiq Muhammad', gender: 'ikhwan', status: 'offline', ketua: 'Donny Hery', ketuaWa: '62895342445516' },
  { name: 'HITS Pria Juni 2025 60', pengajar: 'Adam Malik Nurzuhdi', gender: 'ikhwan', status: 'offline', ketua: 'Septian Nurdin', ketuaWa: '6285782022558' },
];

const AKHWAT_KELAS: KelasData[] = [
  { name: 'HITS Wanita Juni 2025 01', pengajar: 'Talida Jihan Nabila', gender: 'akhwat', status: 'online', ketua: 'Fatika Hilma Ashyla', ketuaWa: '6283133445079' },
  { name: 'HITS Wanita Juni 2025 02', pengajar: 'Annida Uljannah', gender: 'akhwat', status: 'online', ketua: 'Brianya Maulidyna', ketuaWa: '6281290179640' },
  { name: 'HITS Wanita Juni 2025 03', pengajar: 'Annisa Nurrahmah', gender: 'akhwat', status: 'online', ketua: 'Jane Angrama Eka Putri', ketuaWa: '6282237999001' },
  { name: 'HITS Wanita Juni 2025 04', pengajar: 'Annisa Nurrahmah', gender: 'akhwat', status: 'online', ketua: 'Tryani Nursina', ketuaWa: '6283185758186' },
  { name: 'HITS Wanita Juni 2025 06', pengajar: 'Asiyah Annaajiyah', gender: 'akhwat', status: 'online', ketua: 'Savira Elmalia Kharisma', ketuaWa: '6285336191530' },
  { name: 'HITS Wanita Juni 2025 07', pengajar: 'Asiyah Annaajiyah', gender: 'akhwat', status: 'online', ketua: 'Puti Yasmin Aliyyah', ketuaWa: '6282114797880' },
  { name: 'HITS Wanita Juni 2025 08', pengajar: 'Asri Dewi Lestari', gender: 'akhwat', status: 'online', ketua: 'Naztasha Saffana', ketuaWa: '6285920025379' },
  { name: 'HITS Wanita Juni 2025 09', pengajar: 'Asri Dewi Lestari', gender: 'akhwat', status: 'online', ketua: 'Diba Zafirah Hariwijaya', ketuaWa: '62895331401089' },
  { name: 'HITS Wanita Juni 2025 10', pengajar: 'Atalika Khairunnisa', gender: 'akhwat', status: 'online', ketua: 'Maylandari Panjaitan', ketuaWa: '6285359060896' },
  { name: 'HITS Wanita Juni 2025 11', pengajar: 'Atalika Khairunnisa', gender: 'akhwat', status: 'online', ketua: 'Lenni Nasution', ketuaWa: '6281219170911' },
  { name: 'HITS Wanita Juni 2025 12', pengajar: 'Aulia Azizah', gender: 'akhwat', status: 'online', ketua: 'Indy', ketuaWa: '6282114044154' },
  { name: 'HITS Wanita Juni 2025 13', pengajar: 'Baiq Miftahul Husna', gender: 'akhwat', status: 'online', ketua: 'Siti Solehatun Mukaromah', ketuaWa: '6281282968535' },
  { name: 'HITS Wanita Juni 2025 14', pengajar: 'Baiq Miftahul Husna', gender: 'akhwat', status: 'online', ketua: 'Asnaina Nur Afifah', ketuaWa: '6285842894588' },
  { name: 'HITS Wanita Juni 2025 15', pengajar: 'Basmah', gender: 'akhwat', status: 'online', ketua: 'Corry D. Permatasari', ketuaWa: '628558418888' },
  { name: 'HITS Wanita Juni 2025 16', pengajar: 'Basmah', gender: 'akhwat', status: 'online', ketua: 'Salma Sundari', ketuaWa: '6285714315426' },
  { name: 'HITS Wanita Juni 2025 17', pengajar: 'Dian Nurohmah', gender: 'akhwat', status: 'online', ketua: 'Ananda Rahmadini', ketuaWa: '6282122637805' },
  { name: 'HITS Wanita Juni 2025 18', pengajar: 'Dzakiyyah Rahmah', gender: 'akhwat', status: 'online', ketua: 'Mega Octaviany', ketuaWa: '6281196309494' },
  { name: 'HITS Wanita Juni 2025 19', pengajar: 'Dzakiyyah Rahmah', gender: 'akhwat', status: 'online', ketua: 'Devita Bulandari', ketuaWa: '6281910789737' },
  { name: 'HITS Wanita Juni 2025 69', pengajar: 'Fanny Anastasiah', gender: 'akhwat', status: 'offline', ketua: 'Arninta Puspitasari', ketuaWa: '628561611331' },
  { name: 'HITS Wanita Juni 2025 20', pengajar: 'Fanny Anastasiah', gender: 'akhwat', status: 'online', ketua: 'Dian Mursitowati', ketuaWa: '628155271946' },
  { name: 'HITS Wanita Juni 2025 21', pengajar: 'Fanny Anastasiah', gender: 'akhwat', status: 'online', ketua: 'Indriani Nur Fadilla', ketuaWa: '60165175670' },
  { name: 'HITS Wanita Juni 2025 22', pengajar: "Fathimah Fa'iqoh", gender: 'akhwat', status: 'online', ketua: 'Dwi Setia Ningsih', ketuaWa: '6281221564050' },
  { name: 'HITS Wanita Juni 2025 23', pengajar: 'Feni Damayanti', gender: 'akhwat', status: 'online', ketua: 'Fadhilah Ramadhannisa', ketuaWa: '6281288421686' },
  { name: 'HITS Wanita Juni 2025 67', pengajar: 'Andi Hikmah Amaliyah', gender: 'akhwat', status: 'offline', ketua: 'Yolanda Dwi Putri', ketuaWa: '6288297239574' },
  { name: 'HITS Wanita Juni 2025 24', pengajar: 'Iin Dawani', gender: 'akhwat', status: 'online', ketua: 'Andi Nurhikmah', ketuaWa: '' },
  { name: 'HITS Wanita Juni 2025 25', pengajar: 'Iin Dawani', gender: 'akhwat', status: 'online', ketua: 'Nurjannah', ketuaWa: '6285277441998' },
  { name: 'HITS Wanita Juni 2025 26', pengajar: 'Jesi Alya', gender: 'akhwat', status: 'online', ketua: 'Titik Tri Kuntarti', ketuaWa: '628119988459' },
  { name: 'HITS Wanita Juni 2025 27', pengajar: 'Laila Safira', gender: 'akhwat', status: 'online', ketua: 'Anggita Firda', ketuaWa: '6285226458296' },
  { name: 'HITS Wanita Juni 2025 28', pengajar: 'Laila Safira', gender: 'akhwat', status: 'online', ketua: 'Lia Dewi', ketuaWa: '6281930000019' },
  { name: 'HITS Wanita Juni 2025 29', pengajar: 'Zulfah Masitoh', gender: 'akhwat', status: 'online', ketua: 'Adhayani Dewi', ketuaWa: '6281219350352' },
  { name: 'HITS Wanita Juni 2025 30', pengajar: 'Baiq Miftahul Husna', gender: 'akhwat', status: 'online', ketua: 'Adriatik Ivanti', ketuaWa: '6282124363337' },
  { name: 'HITS Wanita Juni 2025 64', pengajar: 'Nur Layla', gender: 'akhwat', status: 'offline', ketua: 'Siti Robayani', ketuaWa: '6281317230275' },
  { name: 'HITS Wanita Juni 2025 68', pengajar: 'Nur Layla', gender: 'akhwat', status: 'offline', ketua: 'Ika Ayu Krisnawardhani', ketuaWa: '6281218994491' },
  { name: 'HITS Wanita Juni 2025 31', pengajar: 'Lubna Rohmayanti', gender: 'akhwat', status: 'online', ketua: 'Wita Meutia', ketuaWa: '6285271365746' },
  { name: 'HITS Wanita Juni 2025 32', pengajar: 'Lubna Rohmayanti', gender: 'akhwat', status: 'online', ketua: 'Fathia Suwaninda', ketuaWa: '6282112599341' },
  { name: 'HITS Wanita Juni 2025 33', pengajar: 'Miftahul Amalia', gender: 'akhwat', status: 'online', ketua: 'Anisa Nurfatriani', ketuaWa: '6282116285784' },
  { name: 'HITS Wanita Juni 2025 34', pengajar: 'Miftahul Amalia', gender: 'akhwat', status: 'online', ketua: 'Junita Amalia', ketuaWa: '6285263722618' },
  { name: 'HITS Wanita Juni 2025 35', pengajar: 'Nadiyah Alamanda', gender: 'akhwat', status: 'online', ketua: 'Kerry Retno Sari', ketuaWa: '6281210975779' },
  { name: 'HITS Wanita Juni 2025 36', pengajar: 'Nafilatullatifah', gender: 'akhwat', status: 'online', ketua: 'Sonnia Gandi', ketuaWa: '6282215084640' },
  { name: 'HITS Wanita Juni 2025 37', pengajar: 'Nurul Azizah', gender: 'akhwat', status: 'online', ketua: 'Astrid Hapsari Rahardjo', ketuaWa: '6287871847660' },
  { name: 'HITS Wanita Juni 2025 38', pengajar: 'Puteri Chamelia Ulfah', gender: 'akhwat', status: 'online', ketua: 'Erna Kusuma Dewi', ketuaWa: '6281280582969' },
  { name: 'HITS Wanita Juni 2025 39', pengajar: 'Putri Nur Sarjiari', gender: 'akhwat', status: 'online', ketua: 'Fathiaturrahmi', ketuaWa: '6281295980087' },
  { name: 'HITS Wanita Juni 2025 40', pengajar: 'Putri Nur Sarjiari', gender: 'akhwat', status: 'online', ketua: 'Duwi Sri Lestari', ketuaWa: '6287775303222' },
  { name: 'HITS Wanita Juni 2025 65', pengajar: 'Rayyan', gender: 'akhwat', status: 'offline', ketua: 'Nadiena Islami Sabilaty', ketuaWa: '6289676461274' },
  { name: 'HITS Wanita Juni 2025 41', pengajar: 'Rayyan', gender: 'akhwat', status: 'online', ketua: 'Widya Sri Kurniawati', ketuaWa: '62895355361550' },
  { name: 'HITS Wanita Juni 2025 42', pengajar: 'Rayyan', gender: 'akhwat', status: 'online', ketua: 'Husna Badzlina Esaputri', ketuaWa: '6282112148191' },
  { name: 'HITS Wanita Juni 2025 43', pengajar: 'Rika Ramadona', gender: 'akhwat', status: 'online', ketua: 'Vivi Amalia Anggraeni', ketuaWa: '6289601487979' },
  { name: 'HITS Wanita Juni 2025 44', pengajar: 'Risa Afrianti', gender: 'akhwat', status: 'online', ketua: 'Rita Nadiroha', ketuaWa: '6281779969338' },
  { name: 'HITS Wanita Juni 2025 45', pengajar: 'Royhana Safira Pardiani', gender: 'akhwat', status: 'online', ketua: 'Ni Putu Supadarini', ketuaWa: '6281805388325' },
  { name: 'HITS Wanita Juni 2025 46', pengajar: 'Royhana Safira Pardiani', gender: 'akhwat', status: 'online', ketua: 'Nikentania', ketuaWa: '628211400100' },
  { name: 'HITS Wanita Juni 2025 47', pengajar: 'Ruqayyah', gender: 'akhwat', status: 'online', ketua: 'Diah Wahyuni', ketuaWa: '6281225577993' },
  { name: 'HITS Wanita Juni 2025 48', pengajar: 'Salma Khoiriyyah', gender: 'akhwat', status: 'online', ketua: 'Nadea Agustina', ketuaWa: '6285600238885' },
  { name: 'HITS Wanita Juni 2025 49', pengajar: 'Salma Rifdatul Husna', gender: 'akhwat', status: 'online', ketua: 'Nastiti Dewayani', ketuaWa: '62811845815' },
  { name: 'HITS Wanita Juni 2025 50', pengajar: 'Salma Rifdatul Husna', gender: 'akhwat', status: 'online', ketua: 'Tara Seprita', ketuaWa: '62818838272' },
  { name: 'HITS Wanita Juni 2025 51', pengajar: 'Salma Suhailah Nizzati', gender: 'akhwat', status: 'online', ketua: 'Laili Sutiyani', ketuaWa: '6281229395263' },
  { name: 'HITS Wanita Juni 2025 52', pengajar: 'Salma Suhailah Nizzati', gender: 'akhwat', status: 'online', ketua: 'Hervina Bate', ketuaWa: '6285280869118' },
  { name: 'HITS Wanita Juni 2025 53', pengajar: 'Silmi Muthmainnah', gender: 'akhwat', status: 'online', ketua: 'Ilma Amaliah', ketuaWa: '6281224436651' },
  { name: 'HITS Wanita Juni 2025 54', pengajar: 'Siti Rohana', gender: 'akhwat', status: 'online', ketua: 'Ayesha Maulida', ketuaWa: '6285813719669' },
  { name: 'HITS Wanita Juni 2025 55', pengajar: 'Andi Hikmah Amaliyah', gender: 'akhwat', status: 'online', ketua: 'Rohma Herlina', ketuaWa: '6285840985082' },
  { name: 'HITS Wanita Juni 2025 56', pengajar: 'Umi Hidayati', gender: 'akhwat', status: 'online', ketua: 'Amalla Vesta Widaranti', ketuaWa: '628129119909' },
  { name: 'HITS Wanita Juni 2025 66', pengajar: 'Wilda', gender: 'akhwat', status: 'offline', ketua: 'Kartika', ketuaWa: '628179838870' },
  { name: 'HITS Wanita Juni 2025 57', pengajar: 'Zain', gender: 'akhwat', status: 'online', ketua: 'Rhesa Kusumawati', ketuaWa: '6281366668812' },
  { name: 'HITS Wanita Juni 2025 58', pengajar: 'Zalfa Ayu', gender: 'akhwat', status: 'online', ketua: 'Melanesia Aesha Yoesoef', ketuaWa: '6285271237741' },
  { name: 'HITS Wanita Juni 2025 59', pengajar: 'Zerina Br Singarimbun', gender: 'akhwat', status: 'online', ketua: 'Siska Setiyani', ketuaWa: '6281215523194' },
  { name: 'HITS Wanita Juni 2025 60', pengajar: 'Zerina Br Singarimbun', gender: 'akhwat', status: 'online', ketua: 'Arini Setya', ketuaWa: '6285769419741' },
  { name: 'HITS Wanita Juni 2025 62', pengajar: 'Zulfah Masitoh', gender: 'akhwat', status: 'online', ketua: 'Dini Adriani', ketuaWa: '6281321028536' },
];

const ALL_KELAS = [...IKHWAN_KELAS, ...AKHWAT_KELAS];

export async function runSeedKelasHits(log: (s: string) => void) {
  const hash = await bcrypt.hash(PWD, 10);

  log('Wipe ketua_kelas...');
  await supabaseAdmin.from('ketua_kelas').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  log('Wipe kelas_hits...');
  await supabaseAdmin.from('kelas_hits').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  log('Fetching existing pengajar...');
  const { data: pengajarRows } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender');
  const pengajarMap = new Map<string, string>();
  for (const p of pengajarRows ?? []) {
    pengajarMap.set(p.name.trim().toLowerCase(), p.id);
  }

  const { data: kelompokRows } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name');
  const kelompokIkhwan = kelompokRows?.find(k => k.name.includes('Ikhwan'))?.id;
  const kelompokAkhwat = kelompokRows?.find(k => k.name.includes('Akhwat'))?.id;

  if (!kelompokIkhwan || !kelompokAkhwat) {
    throw new Error('Kelompok pengajar tidak ditemukan. Jalankan seed HITS utama dulu.');
  }

  function findPengajar(name: string): string | undefined {
    const mapped = NAME_MAP[name.trim()] ?? name.trim();
    return pengajarMap.get(mapped.toLowerCase());
  }

  let created = 0;
  let skippedKetua = 0;

  for (const kelas of ALL_KELAS) {
    let pengajarId = findPengajar(kelas.pengajar);

    if (!pengajarId) {
      const newWa = normalizeWhatsApp(`0000${Date.now().toString().slice(-8)}`);
      const { data: newP, error: pErr } = await supabaseAdmin
        .from('pengajar')
        .insert({
          name: kelas.pengajar.trim(),
          gender: kelas.gender,
          whatsapp_number: newWa,
          password_hash: hash,
          kelompok_id: kelas.gender === 'ikhwan' ? kelompokIkhwan : kelompokAkhwat,
        })
        .select('id')
        .single();
      if (pErr) throw new Error(`Gagal insert pengajar ${kelas.pengajar}: ${pErr.message}`);
      pengajarId = newP.id;
      pengajarMap.set(kelas.pengajar.trim().toLowerCase(), pengajarId!);
      log(`  + Pengajar baru: ${kelas.pengajar}`);
    }

    const { data: kelasRow, error: kErr } = await supabaseAdmin
      .from('kelas_hits')
      .insert({
        name: kelas.name,
        gender: kelas.gender,
        pengajar_id: pengajarId,
        jadwal_hari: 'Senin,Selasa,Rabu,Kamis,Jumat',
        jadwal_waktu_mulai: '16:00',
        jadwal_waktu_selesai: '19:00',
      })
      .select('id')
      .single();
    if (kErr) throw new Error(`Gagal insert kelas ${kelas.name}: ${kErr.message}`);

    if (kelas.ketuaWa) {
      const wa = normalizeWhatsApp(kelas.ketuaWa);
      const { error: kkErr } = await supabaseAdmin
        .from('ketua_kelas')
        .insert({
          name: kelas.ketua,
          gender: kelas.gender,
          whatsapp_number: wa,
          password_hash: hash,
          kelas_hits_id: kelasRow.id,
        });
      if (kkErr) throw new Error(`Gagal insert ketua ${kelas.ketua}: ${kkErr.message}`);
    } else {
      const { error: kkErr } = await supabaseAdmin
        .from('ketua_kelas')
        .insert({
          name: kelas.ketua,
          gender: kelas.gender,
          whatsapp_number: '620000000000',
          password_hash: hash,
          kelas_hits_id: kelasRow.id,
        });
      if (kkErr) throw new Error(`Gagal insert ketua ${kelas.ketua}: ${kkErr.message}`);
      skippedKetua++;
      log(`  ! Ketua ${kelas.ketua} tanpa nomor WA — pakai placeholder`);
    }

    created++;
  }

  log(`Inserted ${created} kelas (${IKHWAN_KELAS.length} ikhwan + ${AKHWAT_KELAS.length} akhwat)`);
  if (skippedKetua > 0) log(`${skippedKetua} ketua kelas tanpa WA (placeholder)`);
}
