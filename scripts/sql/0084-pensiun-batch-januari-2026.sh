#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 0084 — Pensiunkan batch "HITS Online Januari 2026" (SELESAI)
#
# Masalah: 121 baris hits_halaqah batch Januari 2026 masih active=true, padahal
# kelasnya sudah tidak berjalan. Akibatnya ketersediaan-bentrok.ts mengunci 152
# pasangan (pengajar x slot) pada periode "Batch Oktober 2026" dengan alasan
# "Terisi — Anda mengajar <halaqah> di jam ini".
#   ref: src/lib/ketersediaan-bentrok.ts:70-78 (.eq('active', true))
#
# Ruang lingkup: HANYA batch Januari 2026. Batch April 2026 & Juni 2026 TETAP
# aktif — tidak ada satu statement pun di bawah ini yang menyentuhnya.
#
# Kenapa perlu dua langkah (halaqah + sheet source):
#   src/lib/hits-sync.ts:168-179 — setiap syncBatch(batchId) menjalankan
#   rekonsiliasi: semua hits_halaqah dgn source='sheet' di batch itu di-UPDATE
#   active = (namanya terlihat di sheet). Jadi active=false manual akan HIDUP
#   LAGI pada sync berikutnya. Blok itu (dan seluruh upsert halaqah) hanya
#   jalan bila presensiSources.length > 0, sedangkan presensiSources diambil
#   dari hits_sheet_source WHERE batch_id=? AND active=true (hits-sync.ts:47-54).
#   Menonaktifkan baris hits_sheet_source batch ini => syncBatch untuk batch ini
#   jadi no-op => active=false bertahan. TIDAK perlu mengubah Google Sheet.
#
# Cara pakai: jalankan dari root repo, satu statement per panggilan (endpoint
# /api/admin/db membungkus transaksinya sendiri; statement berat => 502 + rollback).
# Idempoten: aman diulang.
#
# PERINGATAN operasional (baca sebelum jalan):
#   - Baca dulu blok "EFEK SAMPING" di bawah. Menonaktifkan 121 halaqah ini
#     juga menghapus mereka dari ranking, rekap, cakupan observasi, dsb.
#   - Setelah ini, tombol "Sync" batch Januari 2026 di /hits/koordinator/validasi
#     tidak lagi menarik data apa pun untuk batch itu (memang itu tujuannya).
#   - Satu-satunya jalan bangkit kembali: koordinator menekan "Enumerasi tab"
#     untuk batch Januari 2026 dengan gid yang BELUM pernah terdaftar
#     (src/app/hits/koordinator/validasi/actions.ts:56-95 menyisipkan baris baru
#     dengan active default true). Jangan lakukan itu untuk batch ini.
# ---------------------------------------------------------------------------
set -euo pipefail

BATCH='53148758-58e1-4ef4-a02c-7ba09bed9d9a'   # HITS Online Januari 2026 (mulai 2026-01-01)
PERIODE='68d84856-4753-45aa-bdb5-3cd8537f16a7' # ks_periode "Batch Oktober 2026" (verifikasi saja)

db()   { npm run -s db -- --confirm "$1"; }   # WRITE — perhatikan `--` sebelum --confirm
read_() { npm run -s db "$1"; }                # READ  — preview/verifikasi

echo '=== 1. PRA-JALAN (READ) ==================================================='

# 1a. Pastikan batch yang disasar benar (nama + tanggal mulai).
read_ "SELECT id, name, start_date FROM hits_batch WHERE id = '$BATCH'"

# 1b. Berapa baris yang akan terdampak? HARUS 121. Kalau bukan, STOP.
read_ "SELECT count(*) AS akan_dinonaktifkan FROM hits_halaqah WHERE batch_id = '$BATCH' AND active = true"

# 1c. Sebaran per gender.
read_ "SELECT coalesce(gender::text,'(null)') AS gender, count(*) FROM hits_halaqah WHERE batch_id = '$BATCH' AND active = true GROUP BY 1 ORDER BY 1"

# 1d. Sebaran per source — baris source='manual' kebal rekonsiliasi sync
#     (hits-sync.ts:174 memfilter source='sheet'), tapi tetap ikut dinonaktifkan
#     oleh UPDATE di langkah 2 karena disaring per batch.
read_ "SELECT source::text, count(*) FROM hits_halaqah WHERE batch_id = '$BATCH' AND active = true GROUP BY 1 ORDER BY 1"

# 1e. Batch lain HARUS tidak tersentuh — catat angkanya untuk dibandingkan nanti.
read_ "SELECT b.name, count(*) FILTER (WHERE h.active) AS aktif, count(*) AS total FROM hits_batch b LEFT JOIN hits_halaqah h ON h.batch_id = b.id GROUP BY b.name ORDER BY b.name"

# 1f. Sumber sheet batch ini (yang akan dinonaktifkan di langkah 3).
read_ "SELECT kind, count(*) FILTER (WHERE active) AS aktif, count(*) AS total FROM hits_sheet_source WHERE batch_id = '$BATCH' GROUP BY kind ORDER BY kind"

# 1g. Slot yang sekarang terkunci di periode Oktober 2026 (angka pembanding 152).
#     Dihitung ulang runtime oleh ketersediaan-bentrok.ts, jadi ini hanya perkiraan
#     dari sisi pengajar: berapa pengajar punya halaqah aktif di batch Januari.
read_ "SELECT count(DISTINCT pengajar_id) AS pengajar_terdampak FROM hits_halaqah WHERE batch_id = '$BATCH' AND active = true AND pengajar_id IS NOT NULL"

echo
echo '=== JEDA: cek 1b == 121 sebelum lanjut. Ctrl-C untuk batal. ==============='
read -r -p 'Lanjut menonaktifkan? ketik YA: ' jawab
[ "$jawab" = 'YA' ] || { echo 'Dibatalkan.'; exit 1; }

echo '=== 2. NONAKTIFKAN HALAQAH (WRITE) ========================================'

# Satu statement, satu tabel, terfilter batch_id. Tidak menyentuh batch lain.
db "UPDATE hits_halaqah SET active = false WHERE batch_id = '$BATCH' AND active = true"

echo '=== 3. CEGAH SYNC MENGHIDUPKANNYA KEMBALI (WRITE) ========================='

# 3a. Presensi: WAJIB. Selama masih ada baris presensi active=true,
#     hits-sync.ts:169-179 akan meng-UPDATE active kembali ke true untuk setiap
#     halaqah source='sheet' yang namanya masih ada di tab presensi.
db "UPDATE hits_sheet_source SET active = false WHERE batch_id = '$BATCH' AND kind = 'presensi' AND active = true"

# 3b. Kaldik: opsional tapi dianjurkan. Tidak menghidupkan halaqah, tapi masih
#     meng-upsert hits_kaldik_hari dan menimpa hits_batch.start_date
#     (hits-sync.ts:61-100) untuk batch yang sudah pensiun.
db "UPDATE hits_sheet_source SET active = false WHERE batch_id = '$BATCH' AND kind = 'kaldik' AND active = true"

# 3c. Tandai alasannya supaya koordinator berikutnya tidak bingung kenapa
#     tombol Sync batch ini diam saja.
db "UPDATE hits_sheet_source SET last_sync_status = 'dinonaktifkan 2026-09-20: batch Januari 2026 dipensiunkan (0084)' WHERE batch_id = '$BATCH'"

# --- CATATAN: Google Sheet TIDAK perlu diubah -------------------------------
# Tidak ada kolom 'retired'/'selesai' di hits_halaqah maupun hits_batch — lever
# satu-satunya adalah bool `active` (lihat supabase/migrations/0022_hits_softskill.sql:82).
# Karena syncBatch memuat sumbernya dari hits_sheet_source (bukan dari daftar
# sheet global), menonaktifkan baris sumber sudah cukup: tab presensi batch
# Januari boleh tetap ada di Google Sheet, tidak akan pernah dibaca lagi.
# Bila suatu saat ingin benar-benar rapi, hapus/arsipkan tab-nya di Sheet —
# itu pekerjaan manual di luar aplikasi dan BUKAN prasyarat skrip ini.

echo '=== 4. VERIFIKASI PASCA-JALAN (READ) ======================================'

# 4a. Harus 0 aktif, 121 nonaktif.
read_ "SELECT count(*) FILTER (WHERE active) AS masih_aktif, count(*) FILTER (WHERE NOT active) AS nonaktif, count(*) AS total FROM hits_halaqah WHERE batch_id = '$BATCH'"

# 4b. Sebaran per gender setelah dinonaktifkan.
read_ "SELECT coalesce(gender::text,'(null)') AS gender, count(*) FROM hits_halaqah WHERE batch_id = '$BATCH' AND active = false GROUP BY 1 ORDER BY 1"

# 4c. Batch lain harus SAMA PERSIS dengan hasil 1e.
read_ "SELECT b.name, count(*) FILTER (WHERE h.active) AS aktif, count(*) AS total FROM hits_batch b LEFT JOIN hits_halaqah h ON h.batch_id = b.id GROUP BY b.name ORDER BY b.name"

# 4d. Tidak ada lagi sumber sheet aktif untuk batch ini => syncBatch no-op.
read_ "SELECT kind, count(*) FILTER (WHERE active) AS masih_aktif, count(*) AS total FROM hits_sheet_source WHERE batch_id = '$BATCH' GROUP BY kind ORDER BY kind"

# 4e. Sumber sheet batch April & Juni harus TETAP aktif.
read_ "SELECT b.name, s.kind, count(*) FILTER (WHERE s.active) AS aktif FROM hits_sheet_source s JOIN hits_batch b ON b.id = s.batch_id WHERE s.batch_id <> '$BATCH' GROUP BY b.name, s.kind ORDER BY b.name, s.kind"

# 4f. Sisa halaqah aktif yang masih mengunci slot bagi pengajar — angka ini yang
#     dilihat modul Ketersediaan (ketersediaan-bentrok.ts: pengajar_id + active).
read_ "SELECT count(*) AS halaqah_aktif_pengunci FROM hits_halaqah WHERE active = true AND pengajar_id IS NOT NULL"

# 4g. Sanity periode ketersediaan yang jadi pemicu.
read_ "SELECT id, nama, kirim_nyata FROM ks_periode WHERE id = '$PERIODE'"

echo
echo 'Selesai. Buka /ketersediaan/koordinator periode Batch Oktober 2026 dan'
echo 'pastikan 152 penguncian sudah hilang (dihitung runtime, tanpa cache DB).'

# ---------------------------------------------------------------------------
# EFEK SAMPING (dibaca dari kode, bukan dugaan) — modul lain yang ikut berubah
# perilaku karena 121 baris ini jadi active=false:
#
#  HILANG dari tampilan (semua memfilter .eq('active', true)):
#   - Ketersediaan / bentrok jadwal .... src/lib/ketersediaan-bentrok.ts:70-78   [TUJUAN]
#   - Ranking disiplin ................. src/lib/hits-ranking.ts:118-121, 368-371
#   - Insiden detail per pengajar ...... src/lib/hits-ranking.ts:368-371
#   - Rekap HITS bulanan ............... src/lib/hits-rekap.ts:89-94
#   - Rekap indisipliner ............... src/lib/hits-rekap.ts:343-346
#   - Cakupan observasi koordinator .... src/lib/hits-observasi-cakupan.ts:62-66
#   - Halaqah hari ini (ketua/harian) .. src/lib/hits-harian.ts:50-53
#   - Dasbor observasi koordinator ..... src/app/observasi/koordinator/page.tsx:205-208
#   - Pertemuan & override koordinator . src/app/hits/koordinator/pertemuan/page.tsx:21-23
#   - Kelola ketua kelas ............... src/app/hits/koordinator/ketua-kelas/page.tsx:43-45
#   - Panel halaqah pengajar ........... src/app/hits/pengajar/page.tsx:29-31
#   - Pilih halaqah di form Shakwa ..... src/app/shakwa/page.tsx:22-25
#   - Daftar/klaim halaqah pengajar .... src/app/hits/pengajar/actions.ts:347-350, 516-520
#   - Kartu detail Matrix pengajar ..... src/app/matrix/koordinator/pengajar/[id]/page.tsx:105-108
#   - Unduhan Matrix ?incomplete=1 ..... src/app/api/matrix/download/route.ts:88-91
#   - Statistik & insight admin ........ src/lib/admin-users.ts:231, 327-329, 469
#
#  TIDAK berubah (tidak memfilter active):
#   - Skor soft skill Matrix ........... src/lib/matrix-compute.ts:314-317 (tanpa .eq active)
#     => nilai Matrix Skill Guru TIDAK bergeser karena perubahan ini.
#   - Hutang menit ..................... src/lib/hits-hutang.ts:136, 164
#   - Pengajuan pindah halaqah ......... src/lib/hits-pengajuan.ts:136-138 (membaca kolom active,
#                                        dipakai untuk label, bukan filter)
#   - Detail pertemuan ketua ........... src/lib/hits-ketua.ts:84-88 (by id)
#   - Login/akses ketua & pengajar ..... src/lib/access.ts, src/lib/auth.ts bergantung pada
#                                        ketua_kelas.active / pengajar.active, BUKAN halaqah.active
#   - Data historis ---- hits_keterangan_harian, hits_pelanggaran, hits_tabayyun,
#     hits_hutang_bayar TIDAK dihapus; hanya tidak lagi teragregasi lewat jalur
#     yang memfilter halaqah aktif.
#   - API publik /api/v1/hits/halaqah .. src/lib/api-public/registry.ts:191-202 tidak
#     mengekspos kolom `active` dan tidak memfilternya => output API TIDAK berubah.
#
#  KONSEKUENSI YANG PERLU DISADARI PEMILIK PROSES:
#   1. Rekap/ranking/cakupan BULAN LALU ikut kosong untuk halaqah Januari.
#      Filter active=true tidak di-scope waktu (hits-rekap.ts:93, hits-ranking.ts:120),
#      jadi membuka rekap bulan Februari-Agustus 2026 setelah ini tidak lagi
#      menampilkan halaqah batch Januari. Bila laporan historis masih dibutuhkan,
#      ekspor/cetak DULU sebelum menjalankan skrip ini.
#   2. Cakupan observasi koordinator turun pembilang & penyebutnya
#      (hits-observasi-cakupan.ts hanya menghitung active=true + pengajar_id),
#      jadi persentase cakupan bulan berjalan akan berubah.
#   3. Ketua kelas batch Januari yang masih punya ketua_kelas.hits_halaqah_id
#      tetap bisa login, tapi halaqahnya hilang dari daftar harian.
#   4. Sync batch Januari 2026 menjadi no-op permanen (sampai ada yang
#      mengaktifkan kembali baris hits_sheet_source-nya).
# ---------------------------------------------------------------------------
