-- 0068_evaluasi_override_lokal.sql
-- Pengajar bisa membetulkan identitas halaqah & nama peserta dari layar
-- /evaluasi/pengajar, tanpa suntingannya ditarik balik sinkron hilmihs.
--
-- Masalahnya: `eval_halaqah` dan `eval_peserta` adalah MIRROR. `sync.ts` memakai
--   COMPARE.halaqah = ['nama','gender','level','pengajar_id','batch_id']
--   COMPARE.peserta = ['nama','gender','halaqah_id','urutan']
-- untuk memutuskan apa yang berubah di hulu. Menulis langsung ke `nama` atau
-- `level` membuat baris itu terlihat "beda dari hulu" pada pull berikutnya, jadi
-- diusulkan sebagai `update` yang mengembalikan nilai lama — persis jebakan yang
-- sudah terjadi saat mengganti pengajar halaqah.
--
-- Karena itu suntingan lokal ditaruh di kolom TERPISAH yang tak pernah dilihat
-- sync maupun apply. Kolom asal tetap cerminan hulu apa adanya; aplikasi
-- menampilkan `coalesce(<kolom>_override, <kolom>)`. Efek sampingnya disengaja:
-- membetulkan data di hulu tidak akan menimpa koreksi pengajar, dan
-- mengosongkan override mengembalikan tampilan ke nilai hulu tanpa kehilangan
-- apa pun.

begin;

alter table eval_halaqah
  add column if not exists nama_override text,
  add column if not exists level_override text;

alter table eval_peserta
  add column if not exists nama_override text;

comment on column eval_halaqah.nama_override is
  'Nama halaqah versi lokal (mis. pembetulan nomor). NULL = ikut kolom nama dari hilmihs. Tidak pernah ditulis sinkron.';
comment on column eval_halaqah.level_override is
  'Level versi lokal — "Dasar" atau "Lanjutan". NULL = ikut kolom level dari hilmihs. Tidak pernah ditulis sinkron.';
comment on column eval_peserta.nama_override is
  'Nama peserta versi lokal (pembetulan ejaan). NULL = ikut kolom nama dari hilmihs. Tidak pernah ditulis sinkron.';

commit;
