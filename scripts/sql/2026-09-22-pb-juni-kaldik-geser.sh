#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Data fix — HITS Online Juni 2026: buka tahap Perbaikan Bacaan untuk halaqah
# program "dasar" supaya pertemuannya muncul dan bisa diobservasi.
#
# Masalah
#   Kaldik PB batch Juni dibuat mulai 2026-06-22 — tanggal yang sama dengan
#   kaldik QN (2026-06-22..2026-09-20), bukan setelahnya. deriveHalaqahProgram
#   (src/lib/hits-pertemuan.ts:195) membuang pertemuan tahap berikutnya yang
#   tanggalnya <= pertemuan terakhir tahap sebelumnya, jadi seluruh pertemuan PB
#   (paling akhir 2026-09-13) tersaring habis → 0 pertemuan PB untuk 79 halaqah
#   dasar. Batch lain sudah benar: PB mulai H+1 setelah QN berakhir.
#     Januari : QN 01-12..06-07 → PB 06-08..08-30
#     April   : QN 04-13..07-19 → PB 07-20..10-11
#     Juni    : QN 06-22..09-20 → PB 06-22..09-13   <-- salah
#
# Perbaikan: geser 84 baris kaldik PB batch Juni +91 hari (tepat 13 pekan, jadi
# kolom `hari` tetap cocok) → 2026-09-21..2026-12-13, pekan 1..12.
#
# Sebelum digeser, bersihkan sisa salah-tag era Juni–Agustus (17 halaqah yang
# dulu ter-tag lanjutan/PB lalu diubah ke dasar). Tanpa ini, slot PB 1..6 yang
# baru terbuka sudah terisi data Juni dengan tanggal yang salah.
#
# Ruang lingkup: HANYA batch bc5a63d2 (HITS Online Juni 2026), HANYA halaqah
# program='dasar'. Halaqah program='lanjutan' menurunkan pertemuan dari kaldik
# QN, jadi tidak tersentuh sama sekali.
#
# Catatan: 3 halaqah bernama "Lanjutan HITS 002/037 IKHWAN" dan "Lanjutan HITS
# 087 AKHWAT" ber-program='dasar' dan ikut dapat tahap PB. Itu DISENGAJA, bukan
# salah tag: audit_log action='ubah_level_halaqah' mencatat pengajarnya sendiri
# yang memindahkan lanjutan→dasar (18 Jul, 2 Agu, 8 Agu 2026) lewat fitur
# ubahLevelHalaqah (src/app/hits/pengajar/actions.ts:626). Sebaliknya 4 halaqah
# (HITS 018 IKHWAN, 040/071/080 AKHWAT) dipindah dasar→lanjutan dan tidak
# meninggalkan baris QN yatim — sudah dicek, 0 baris.
#
# Jalankan dari root repo. Angka yang diharapkan ditulis di tiap langkah.
# ---------------------------------------------------------------------------
set -euo pipefail

BATCH='bc5a63d2-c473-4035-93b0-6b8b07582eaa'
db() { npm run -s db -- --confirm "$1"; }

# 1) Buang 63 baris keterangan PB basi yang kembarannya sudah ada di QN.
#    Semuanya dibuat SEBELUM baris QN-nya (ketua mengisi ulang setelah halaqah
#    di-retag ke dasar) → baris QN yang berlaku. Harapan: 63 baris.
db "delete from hits_keterangan_harian pb using hits_halaqah h, hits_keterangan_harian qn where pb.halaqah_id = h.id and h.batch_id = '$BATCH' and h.program = 'dasar' and pb.level = 'perbaikan_bacaan' and pb.tanggal <= '2026-09-20' and qn.halaqah_id = pb.halaqah_id and qn.level = 'qoidah_nuroniyyah' and qn.pertemuan_no = pb.pertemuan_no"

# 2) Sisa 5 baris PB tanpa kembaran QN (HITS 020/030/074 AKHWAT, pertemuan 1-2,
#    semua KBBS) sebenarnya pertemuan QN — pindahkan levelnya, datanya utuh.
#    Harapan: 5 baris.
db "update hits_keterangan_harian pb set level = 'qoidah_nuroniyyah' from hits_halaqah h where pb.halaqah_id = h.id and h.batch_id = '$BATCH' and h.program = 'dasar' and pb.level = 'perbaikan_bacaan' and pb.tanggal <= '2026-09-20'"

# 3) Buang 5 override is_skipped level PB milik HITS 028 AKHWAT JUNI (dibuat
#    2026-07-23 saat halaqah masih salah tag; QN 1-5 halaqah itu terisi normal).
#    Kalau dibiarkan, override ini menyembunyikan PB pertemuan 1-5 yang baru.
#    Harapan: 5 baris.
db "delete from hits_kaldik_pertemuan p using hits_halaqah h where p.halaqah_id = h.id and h.batch_id = '$BATCH' and h.program = 'dasar' and p.level = 'perbaikan_bacaan'"

# 4) Geser kaldik PB batch Juni +91 hari → 2026-09-21..2026-12-13.
#    Harapan: 84 baris.
db "update hits_kaldik_hari set tanggal = tanggal + 91 where batch_id = '$BATCH' and level = 'perbaikan_bacaan'"

# ---- Verifikasi ----
# Kaldik: PB harus 2026-09-21..2026-12-13 pekan 1..12; QN tidak berubah.
npm run -s db "select level::text as lv, count(*) as baris, min(tanggal) as mulai, max(tanggal) as akhir, min(pekan) as pekan_min, max(pekan) as pekan_max from hits_kaldik_hari where batch_id = '$BATCH' group by level order by 1"
# Keterangan: tidak boleh ada lagi baris PB bertanggal <= 2026-09-20 di dasar.
npm run -s db "select count(*) as sisa_pb_lama from hits_keterangan_harian k join hits_halaqah h on h.id = k.halaqah_id where h.batch_id = '$BATCH' and h.program = 'dasar' and k.level = 'perbaikan_bacaan' and k.tanggal <= '2026-09-20'"
