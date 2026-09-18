-- Rilis prod: Halaqah Tahfizh akhwat — cabut takhassus, rename, At-Tibyan gabungan.
-- Spec: docs/superpowers/specs/2026-09-18-halaqah-tahfizh-akhwat-presensi-design.md
--
-- Urutan WAJIB: [A] DDL 0083 → deploy kode → [B] cabut takhassus → [C] rename
-- → [D] ikut_tibyan=false → [E] kelas At-Tibyan → [F] anggota → [G] verifikasi.
-- Tiap langkah = satu pemanggilan:  npm run db -- "<SQL>" -- --confirm
-- (preview dulu tanpa --confirm; cocokkan wouldAffect dengan angka di komentar).

-- ============================================================
-- [A] DDL 0083 — SEBELUM deploy kode. wouldAffect: 0 (DDL).
-- ============================================================
alter table program_kelas add column if not exists ikut_tibyan boolean not null default true;

-- (opsional, pemanggilan terpisah)
comment on column program_kelas.ikut_tibyan is 'Bila false, kelas ini tidak ditagih sesi At-Tibyan Sabtu (At-Tibyan-nya dicatat lewat kelas lain).';

-- ============================================================
-- [B] Cabut anggota takhassus dari kelas halaqah. Harapan: 8 baris.
--     Salma 6282136573097: Pagi Selasa, Pagi Jum'at, Siang Selasa
--     Radiatam 6281261306563: Pagi Rabu, Pagi Jum'at
--     Annida 6285788064547: Siang Senin, Siang Rabu, Siang Jum'at
-- ============================================================
update program_kelas_anggota a
   set active = false
  from program_kelas k
 where k.id = a.program_kelas_id
   and k.gender = 'akhwat'
   and k.name like 'Maahir Halaqah %'
   and a.active
   and a.whatsapp_number in ('6282136573097', '6281261306563', '6285788064547');

-- ============================================================
-- [C] Rename 10 kelas. Harapan: 10 baris.
-- ============================================================
update program_kelas
   set name = replace(replace(name, 'Maahir Halaqah Pagi (', 'Maahir Halaqah Tahfizh Pagi ('),
                              'Maahir Halaqah Siang (', 'Maahir Halaqah Tahfizh Siang (')
 where gender = 'akhwat'
   and (name like 'Maahir Halaqah Pagi (%' or name like 'Maahir Halaqah Siang (%');

-- ============================================================
-- [D] ikut_tibyan=false: 10 halaqah + Takhassus Akhwat. Harapan: 11 baris.
-- ============================================================
update program_kelas
   set ikut_tibyan = false
 where gender = 'akhwat'
   and (name like 'Maahir Halaqah Tahfizh Pagi (%'
        or name like 'Maahir Halaqah Tahfizh Siang (%'
        or name = 'Maahir Takhassus Akhwat');

-- ============================================================
-- [E] Kelas At-Tibyan gabungan. Harapan: 1 baris.
--     ketua_wa = Annidaul Jannah. ikut_tibyan default true.
-- ============================================================
insert into program_kelas
  (name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa,
   self_attendance, presensi_sifat, mulai_tanggal)
values
  ('Maahir Halaqah Tahfizh (At-Tibyan)', 'akhwat', '{}', '08:30', '10:30',
   '6285788064547', null, false, 'harian', '2026-09-15');

-- ============================================================
-- [F] Anggota kelas At-Tibyan: 24 unik dari 10 halaqah (sesudah [B]) + 4
--     takhassus. Harapan: 28 baris. Kunci unik = WA, atau nama bila WA null
--     (Khoirun Nisa). Annida is_ketua.
-- ============================================================
insert into program_kelas_anggota
  (program_kelas_id, peserta_id, name, whatsapp_number, is_ketua, is_wakil, active, mulai_tanggal)
select
  (select id from program_kelas where name = 'Maahir Halaqah Tahfizh (At-Tibyan)'),
  s.peserta_id, s.name, s.whatsapp_number,
  coalesce(s.whatsapp_number = '6285788064547', false) as is_ketua,
  false, true, '2026-09-15'
from (
  select distinct on (coalesce(a.whatsapp_number, 'nama:' || a.name))
         a.peserta_id, a.name, a.whatsapp_number
    from program_kelas_anggota a
    join program_kelas k on k.id = a.program_kelas_id
   where k.gender = 'akhwat'
     and a.active
     and (k.name like 'Maahir Halaqah Tahfizh Pagi (%'
          or k.name like 'Maahir Halaqah Tahfizh Siang (%'
          or k.name = 'Maahir Takhassus Akhwat')
   order by coalesce(a.whatsapp_number, 'nama:' || a.name), a.created_at
) s;

-- ============================================================
-- [G] Verifikasi (READ, tanpa --confirm)
-- ============================================================
-- 11 baris ikut_tibyan=false, semuanya akhwat:
select name, ikut_tibyan from program_kelas where ikut_tibyan = false order by name;
-- 28 anggota, 1 ketua (Annidaul Jannah):
select count(*) n, count(*) filter (where is_ketua) ketua
  from program_kelas_anggota a join program_kelas k on k.id = a.program_kelas_id
 where k.name = 'Maahir Halaqah Tahfizh (At-Tibyan)' and a.active;
-- 0 baris: takhassus tak lagi aktif di halaqah per-hari:
select k.name, a.name from program_kelas_anggota a join program_kelas k on k.id = a.program_kelas_id
 where (k.name like 'Maahir Halaqah Tahfizh Pagi (%' or k.name like 'Maahir Halaqah Tahfizh Siang (%')
   and a.active and a.whatsapp_number in ('6282136573097','6281261306563','6285788064547');
-- 0 baris: tak ada nama halaqah lama tersisa:
select name from program_kelas where name like 'Maahir Halaqah Pagi (%' or name like 'Maahir Halaqah Siang (%';
