-- Migrasi Maahir 2026-07-29
-- 1. mode kehadiran online/offline per peserta per pertemuan
-- 2. pemutihan absensi per peserta per bulan (dianggap hadir penuh)
-- 3. catatan bebas di Laporan Bulanan Maahir (tetap + manual)
-- 4. tanggal mulai peserta (opsional, menggantikan tebakan created_at)
--
-- Jalankan: npm run db -- "$(cat scripts/sql/2026-07-29-maahir-note-pemutihan-mode.sql)" --confirm

ALTER TABLE kehadiran_peserta
  ADD COLUMN IF NOT EXISTS mode text;

ALTER TABLE program_kelas_anggota
  ADD COLUMN IF NOT EXISTS mulai_tanggal date;

CREATE TABLE IF NOT EXISTS maahir_pemutihan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anggota_id uuid NOT NULL REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  month text NOT NULL,                      -- 'YYYY-MM' periode laporan
  alasan text,
  dibuat_oleh text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anggota_id, month)
);

CREATE TABLE IF NOT EXISTS laporan_maahir_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,                      -- 'YYYY-MM'
  teks text NOT NULL,
  urutan integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS laporan_maahir_note_month_idx ON laporan_maahir_note (month, urutan);
