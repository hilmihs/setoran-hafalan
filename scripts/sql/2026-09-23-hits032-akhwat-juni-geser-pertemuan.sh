#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Data fix — HITS 032 AKHWAT JUNI (020b73cd): nomor pertemuan app selisih satu
# dari nomor pertemuan nyata sejak pertemuan 18, sehingga PB pertemuan 1 jatuh
# di Selasa 22 Sep padahal di kelas baru dimulai Jum'at 25 Sep 2026.
#
# Asal-usul
#   Jadwal Selasa & Jum'at. Pertemuan 18 (Jum'at 21 Agu) diganti ke Selasa
#   25 Agu lewat koreksi ketua (disetujui 30 Agu), tapi override yang tersimpan
#   is_skipped=true — slot 21 Agu dibuang, bukan dipindah. Akibatnya sejak itu
#   app menghitung satu di depan: sesi yang ketua catat "PERTEMUAN KE 18" masuk
#   QN 19, ..., "PERTEMUAN KE 25" (18 Sep) masuk QN 26, dan "Pertemuan ke 26 /
#   Ujian ke-2" (22 Sep) terpaksa diisi sebagai PB 1. QN kelas ini nyata berakhir
#   22 Sep; PB 1 = 25 Sep.
#   Ketua sempat mengajukan koreksi lagi (22 Sep) tapi memilih tahap QN
#   pertemuan 1 → 25 Sep; kalau di-Acc, QN 1 bulan Juni pindah ke September.
#
# Perbaikan (hanya halaqah ini)
#   QN : p18 dihidupkan di 25 Agu, p19..p26 digeser satu slot (p26 = 22 Sep);
#        keterangan QN 19..26 dinomori ulang 18..25; keterangan PB 1 (22 Sep)
#        dipindah ke QN 26; baris basi "GANTI HARI" di QN 18 dibuang.
#   PB : p1..p23 digeser satu slot (p1 = 25 Sep), p24 = Selasa 15 Des 2026
#        (dua hari di luar kaldik PB yang berakhir 13 Des).
#   Pengajuan koreksi pending 3e095b5d ditolak.
#
# Jalankan dari root repo. Angka yang diharapkan ditulis di tiap langkah.
# ---------------------------------------------------------------------------
set -euo pipefail

H='020b73cd-7ecb-47a7-9e3f-24937d1680ed'
B='bc5a63d2-c473-4035-93b0-6b8b07582eaa'
NOTE='Geser satu slot: sesi 21 Agu diganti 25 Agu — laporan ketua 23 Sep 2026'
# set_by_id NOT NULL tanpa FK dan tak dibaca kode mana pun → UUID nol untuk
# perubahan superadmin lewat skrip.
AKTOR='00000000-0000-0000-0000-000000000000'
# Lanjutkan dari langkah tertentu: `bash <skrip> 4`. Langkah 2 TIDAK idempoten
# (menomori ulang lagi), jadi jangan ulangi langkah yang sudah COMMITTED.
MULAI="${1:-1}"
db() { npm run -s db -- --confirm "$1"; }
langkah() { [ "$1" -ge "$MULAI" ]; }

# 1) Buang keterangan basi QN 18 ("GANTI HARI", tersembunyi karena p18 skipped).
#    Harapan: 1 baris.
langkah 1 && db "delete from hits_keterangan_harian where halaqah_id = '$H' and level = 'qoidah_nuroniyyah' and pertemuan_no = 18"

# 2) Nomori ulang keterangan QN 19..26 → 18..25 (dua langkah; unique
#    (halaqah_id, level, pertemuan_no) tidak deferrable). Harapan: 8 lalu 8.
langkah 2 && db "update hits_keterangan_harian set pertemuan_no = pertemuan_no + 999 where halaqah_id = '$H' and level = 'qoidah_nuroniyyah' and pertemuan_no between 19 and 26"
langkah 2 && db "update hits_keterangan_harian set pertemuan_no = pertemuan_no - 1000 where halaqah_id = '$H' and level = 'qoidah_nuroniyyah' and pertemuan_no between 1018 and 1025"

# 3) Keterangan 22 Sep (tercatat PB 1) sebenarnya QN 26. Harapan: 1 baris.
langkah 3 && db "update hits_keterangan_harian set level = 'qoidah_nuroniyyah', pertemuan_no = 26 where halaqah_id = '$H' and level = 'perbaikan_bacaan' and pertemuan_no = 1 and tanggal = '2026-09-22'"

# 4) Override QN p18..p26. Harapan: 9 baris (1 update p18 + 8 insert).
langkah 4 && db "insert into hits_kaldik_pertemuan (halaqah_id, level, pertemuan_no, tanggal, pekan, is_skipped, note, set_by_role, set_by_id) select '$H', 'qoidah_nuroniyyah', v.no, v.tgl::date, null, false, '$NOTE', 'superadmin', '$AKTOR' from (values (18,'2026-08-25'),(19,'2026-08-28'),(20,'2026-09-01'),(21,'2026-09-04'),(22,'2026-09-08'),(23,'2026-09-11'),(24,'2026-09-15'),(25,'2026-09-18'),(26,'2026-09-22')) v(no, tgl) on conflict (halaqah_id, level, pertemuan_no) do update set tanggal = excluded.tanggal, pekan = null, is_skipped = false, note = excluded.note, set_by_role = excluded.set_by_role, set_by_id = excluded.set_by_id, updated_at = now()"

# 5) Override PB p1..p24: tanggal = slot Selasa/Jum'at kaldik berikutnya,
#    p24 = 2026-12-15. Harapan: 24 baris.
langkah 5 && db "insert into hits_kaldik_pertemuan (halaqah_id, level, pertemuan_no, tanggal, pekan, is_skipped, note, set_by_role, set_by_id) select '$H', 'perbaikan_bacaan', x.no, x.tanggal, null, false, '$NOTE', 'superadmin', '$AKTOR' from (select (row_number() over (order by tanggal) - 1)::int as no, tanggal from hits_kaldik_hari where batch_id = '$B' and level = 'perbaikan_bacaan' and not is_libur and extract(isodow from tanggal) in (2, 5) union all select 24, date '2026-12-15') x where x.no between 1 and 24 on conflict (halaqah_id, level, pertemuan_no) do update set tanggal = excluded.tanggal, pekan = null, is_skipped = false, note = excluded.note, set_by_role = excluded.set_by_role, set_by_id = excluded.set_by_id, updated_at = now()"

# 6) Tolak pengajuan koreksi pending (QN 1 → 25 Sep, salah tahap).
#    Harapan: 1 lalu 1.
langkah 6 && db "update hits_pertemuan_koreksi_item set status = 'rejected', decided_at = now() where koreksi_id = '3e095b5d-407f-495c-84c7-baf156e16766' and status = 'pending'"
langkah 6 && db "update hits_pertemuan_koreksi set status = 'selesai', decided_by_role = 'superadmin', decided_at = now() where id = '3e095b5d-407f-495c-84c7-baf156e16766' and status = 'pending'"

# ---- Verifikasi ----
# (selalu jalan)
# Override: QN 18..26 (26 = 2026-09-22), PB 1 = 2026-09-25 .. PB 24 = 2026-12-15.
npm run -s db "select level::text lv, count(*) n, min(pertemuan_no) no_min, max(pertemuan_no) no_max, min(tanggal) mulai, max(tanggal) akhir, bool_or(is_skipped) ada_skip from hits_kaldik_pertemuan where halaqah_id = '$H' group by 1 order by 1"
# Keterangan sejak Agustus: QN 16..26 berurutan, tanpa PB.
npm run -s db "select level::text lv, pertemuan_no, tanggal, left(catatan, 20) c from hits_keterangan_harian where halaqah_id = '$H' and tanggal >= '2026-08-14' order by tanggal"
