-- Migrasi Maahir 2026-08-07 — pemutihan bertanggal & bisa ditelusuri
--
-- 1. `tanggal`: pemutihan boleh menyasar satu tanggal, tak lagi selalu sebulan
--    penuh. NULL = seluruh bulan (arti lama; 3 baris yang sudah ada tetap sah).
-- 2. `dibatalkan_pada`/`dibatalkan_oleh`: pembatalan tak lagi menghapus baris,
--    supaya daftar SP tetap menyimpan bank data siapa pernah diputihkan.
-- 3. Kunci unik pindah ke (anggota_id, month, tanggal) dan hanya berlaku untuk
--    baris yang masih aktif — orang yang pemutihannya dibatalkan boleh
--    diputihkan lagi di tanggal yang sama. NULLS NOT DISTINCT (PG15+) dipakai
--    supaya dua baris "sebulan penuh" tetap bentrok.
--
-- Jalankan SEBELUM deploy kode yang men-select kolom baru.
--   npm run db -- "$(cat scripts/sql/2026-08-07-pemutihan-bertanggal.sql)" --confirm

ALTER TABLE maahir_pemutihan
  ADD COLUMN IF NOT EXISTS tanggal         date,
  ADD COLUMN IF NOT EXISTS dibatalkan_pada timestamptz,
  ADD COLUMN IF NOT EXISTS dibatalkan_oleh text;

ALTER TABLE maahir_pemutihan
  DROP CONSTRAINT IF EXISTS maahir_pemutihan_anggota_id_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS maahir_pemutihan_aktif_uniq
  ON maahir_pemutihan (anggota_id, month, tanggal) NULLS NOT DISTINCT
  WHERE dibatalkan_pada IS NULL;
