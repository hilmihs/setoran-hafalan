-- Migrasi Maahir 2026-08-14 — target setoran hafalan harian (Takhassus)
--
-- Laporan bulanan membandingkan setoran peserta dengan 80 halaman/bulan yang
-- ditulis mati di kode. Angka itu tak adil: Takhassus Ikhwan berjadwal 5
-- hari/pekan (~21 sesi/periode), Akhwat 4 hari/pekan (~17 sesi) — beban yang
-- sama di atas kertas berarti tuntutan harian yang berbeda. Target karena itu
-- disimpan sebagai halaman PER HARI, lalu dikalikan sesi yang ditagih ke tiap
-- peserta.
--
-- 1. `anggota_id NULL` = target default seluruh kelas. Pola yang sama sudah
--    dipakai `program_kelas_libur.program_kelas_id NULL = semua kelas`. Baris
--    dengan anggota_id = koreksi untuk satu peserta, dan menang atas default
--    kelasnya. Koordinator cukup mengisi 2 angka supaya laporan jalan, lalu
--    menyetel per orang bila perlu.
-- 2. `berlaku_mulai` = tanggal target mulai berlaku. Baris TIDAK di-update saat
--    target berubah; koordinator menambah versi baru. Dua akibatnya disengaja:
--    periode yang sudah dilaporkan tetap memakai target yang berlaku saat itu,
--    dan riwayat siapa menaikkan target & kapan terbaca dari tabelnya sendiri
--    tanpa tabel log terpisah.
-- 3. `halaman_per_hari numeric(4,2)` — pemula boleh 0.5 halaman/hari.
--
-- Sengaja TANPA baris awal. Selama koordinator belum mengisi, laporan
-- menampilkan '—', bukan angka default yang seolah-olah sudah resmi. Form
-- memasang berlaku_mulai default ke awal program supaya target pertama berlaku
-- mundur dan periode Juni/Juli ikut punya angka capaian.
--
-- Jalankan SEBELUM deploy kode yang men-select kolom baru.
--   npm run db -- "$(cat scripts/sql/2026-08-14-setoran-target.sql)" --confirm

CREATE TABLE IF NOT EXISTS maahir_setoran_target (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE,
  -- NULL = default seluruh kelas; terisi = koreksi satu peserta.
  anggota_id       uuid REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  halaman_per_hari numeric(4,2) NOT NULL CHECK (halaman_per_hari > 0),
  berlaku_mulai    date        NOT NULL,
  catatan          text,
  dibuat_oleh      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Satu versi per (sasaran, tanggal berlaku). NULLS NOT DISTINCT (PG15+) supaya
-- dua baris default-kelas di tanggal yang sama tetap bentrok — pola yang sama
-- dipakai maahir_pemutihan_aktif_uniq.
CREATE UNIQUE INDEX IF NOT EXISTS maahir_setoran_target_versi_uniq
  ON maahir_setoran_target (program_kelas_id, anggota_id, berlaku_mulai) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS maahir_setoran_target_kelas_idx
  ON maahir_setoran_target (program_kelas_id, berlaku_mulai);
