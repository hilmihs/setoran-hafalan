// Panduan standar skala penilaian kualitas pengajar (Bacaan & Hafalan).
// Sumber: sheet "Referensi" Template_Penilaian_Pengajar_HITS.xlsx.
// Single source of truth untuk legend di PenilaianMasyaikhForm.

export type RubrikSkala = {
  skala: 0 | 1 | 2 | 3 | 4;
  teks: string;
  standar?: boolean;
};

export const RUBRIK_BACAAN: RubrikSkala[] = [
  { skala: 0, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 1–23' },
  { skala: 1, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 24–46' },
  { skala: 2, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 47–69' },
  { skala: 3, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 70–85', standar: true },
  { skala: 4, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 86–100' },
];

export const CATATAN_BACAAN =
  'Lahn Jaliy: Ubah Huruf, Ubah Harakat, Tukar Mad. ' +
  'Lahn Khafiy: Shifat Huruf, Kesempurnaan Makhraj, Itmamul Harakat, ' +
  'Hukum Nun & Mim, Zamanul Huruf, Zamanul Ghunnah, Zamanul Mudud.';

// Indikator Standar / Kriteria — kolom "Referensi" template.
export const KRITERIA_BACAAN = [
  'Tidak ada Lahn Jaliy dari hasil ujian akhir (setiap Lahn Jaliy mengurangi nilai 50).',
  'Kadar Lahn Khafiy dari hasil ujian akhir tidak boleh di bawah standar yang ditetapkan.',
];

export const RUBRIK_HAFALAN: RubrikSkala[] = [
  { skala: 0, teks: 'Hafal 0–4 juz' },
  { skala: 1, teks: 'Hafal 5–10 juz', standar: true },
  { skala: 2, teks: 'Hafal 11–15 juz' },
  { skala: 3, teks: 'Hafal 16–20 juz' },
  { skala: 4, teks: 'Hafal 21–30 juz' },
];

export const KRITERIA_HAFALAN = [
  'Menghafal 5 juz (prasyarat masuk Maahir).',
];
