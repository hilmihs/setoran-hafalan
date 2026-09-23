-- Rilis prod: presensi & setoran Takhassus akhwat lewat ketua Halaqah Tahfizh.
-- Spec: docs/superpowers/specs/2026-09-23-takhassus-akhwat-via-halaqah-design.md
-- Berlaku Senin 28 Sep 2026 (awal periode 28–27). Jalankan [B]–[D] PADA atau
-- SESUDAH 28 Sep — sebelum itu Salma masih wajib mengisi sesi s/d 27 Sep, dan
-- itu tetap bisa ia lakukan karena pengalihan hanya berlaku sejak 28 Sep.
--
-- PRASYARAT: rilis 0083 langkah [C]–[H] (scripts/sql/0083-rilis-halaqah-tahfizh-akhwat.sql).
-- Per 23 Sep di prod baru [A] dan [B] yang jalan: kelas halaqah masih
-- ikut_tibyan=true dan kelas At-Tibyan gabungan belum ada. Tanpa [D]–[F] itu,
-- mengaktifkan kembali takhassus di kelas halaqah membuat mereka tertagih
-- At-Tibyan di tiap kelas halaqahnya (satu alpa Sabtu = beberapa SP).
--
-- Urutan: [A] DDL 0087 → deploy kode → 0083 [C]–[H] → [B] → [C] → [D] → [V].
-- Tiap statement = satu pemanggilan:
--   npm run db -- --confirm "<SQL>"
-- Preview dulu tanpa --confirm; cocokkan wouldAffect dengan angka di komentar.
-- Angka lain dari harapan — BERHENTI, jangan --confirm.

-- ============================================================
-- [A] DDL 0087 — SEBELUM deploy kode (kode memilih kolom ini). wouldAffect: 0.
-- ============================================================
alter table program_kelas add column if not exists presensi_via_halaqah_mulai date;

-- (opsional, pemanggilan terpisah)
comment on column program_kelas.presensi_via_halaqah_mulai is 'Mulai tanggal ini sesi kelas_maahir kelas ini tak dipresensi sendiri; anggotanya dipresensi di kelas halaqah mereka (dicocokkan lewat WA).';

-- ============================================================
-- [B] Aktifkan kembali takhassus di kelas halaqah, mulai 28 Sep. Harapan: 8 baris.
--     Salma 6282136573097: Pagi Selasa, Pagi Jum'at, Siang Selasa
--     Radiatam 6281261306563: Pagi Rabu, Pagi Jum'at
--     Annida 6285788064547: Siang Senin, Siang Rabu, Siang Jum'at
--     Nur Afifah (6282269092601) cuti — tak ditempatkan.
--     Idempoten: baris yang sudah aktif ber-mulai 28 Sep tak tersentuh.
-- ============================================================
update program_kelas_anggota a
   set active = true,
       mulai_tanggal = '2026-09-28'
  from program_kelas k
 where k.id = a.program_kelas_id
   and k.gender = 'akhwat'
   and (k.name like 'Maahir Halaqah Tahfizh Pagi (%' or k.name like 'Maahir Halaqah Tahfizh Siang (%')
   and a.whatsapp_number in ('6282136573097', '6281261306563', '6285788064547')
   and not (a.active and a.mulai_tanggal = '2026-09-28');

-- ============================================================
-- [C] Alihkan presensi kelas Takhassus Akhwat. Harapan: 1 baris.
-- ============================================================
update program_kelas
   set presensi_via_halaqah_mulai = '2026-09-28'
 where name = 'Maahir Takhassus Akhwat'
   and presensi_via_halaqah_mulai is distinct from '2026-09-28';

-- ============================================================
-- [D] Target default 80 hal/bulan sejak 28 Sep. Harapan: 1 baris.
--     Versi lama (32, sejak 2026-06-01) dibiarkan — laporan s/d September
--     tetap memakainya.
-- ============================================================
insert into maahir_setoran_target (program_kelas_id, anggota_id, halaman_per_bulan, berlaku_mulai, catatan, dibuat_oleh)
select k.id, null, 80, '2026-09-28', 'Takhassus akhwat via halaqah', 'Koordinator'
  from program_kelas k
 where k.name = 'Maahir Takhassus Akhwat'
   and not exists (select 1 from maahir_setoran_target t
                    where t.program_kelas_id = k.id and t.anggota_id is null
                      and t.berlaku_mulai = '2026-09-28');

-- ============================================================
-- [V] Verifikasi (tiap SELECT satu pemanggilan).
-- ============================================================
-- [V1] Penempatan: 8 baris, semua active=true, mulai 2026-09-28.
select a.name, k.name as kelas, a.active, a.mulai_tanggal, a.selesai_tanggal
  from program_kelas_anggota a join program_kelas k on k.id = a.program_kelas_id
 where a.whatsapp_number in ('6282136573097', '6281261306563', '6285788064547')
   and k.name like 'Maahir Halaqah Tahfizh %'
 order by a.name, k.name;

-- [V2] Kelas: Takhassus Akhwat ber-presensi_via 2026-09-28; halaqah & Takhassus ikut_tibyan=false.
select name, presensi_via_halaqah_mulai, ikut_tibyan
  from program_kelas
 where gender = 'akhwat'
   and (name like 'Maahir Halaqah Tahfizh%' or name = 'Maahir Takhassus Akhwat')
 order by name;

-- [V3] Target: 32 sejak 2026-06-01 dan 80 sejak 2026-09-28.
select t.anggota_id, t.halaman_per_bulan, t.berlaku_mulai
  from maahir_setoran_target t join program_kelas k on k.id = t.program_kelas_id
 where k.name = 'Maahir Takhassus Akhwat'
 order by t.berlaku_mulai;
