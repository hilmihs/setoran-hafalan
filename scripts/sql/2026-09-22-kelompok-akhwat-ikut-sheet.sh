#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Data fix — susunan kelompok pengajar AKHWAT disamakan dengan sheet.
#
# Sheet = sumber susunan kelompok. Crosscheck 2026-09-22 menemukan 19 dari 88
# anggota berada di kelompok lain di DB. Ketua 13/13 sudah tepat (tiga cuma
# beda cara tulis: Putri Nur → Putri Nur Sarjiari, Salma Rifdah → Salma
# Rifdatul Husna, Annisa Nur Rahmah → Annisa Nurrahmah) — tidak disentuh.
#
# Kenapa penting: kelompok menentukan SIAPA MENILAI SIAPA. Form Penilaian
# Pedagogis hanya menampilkan anggota kelompok si ketua, dan dari situlah skor
# "Manajemen Halaqah" berasal — satu-satunya indikator Soft Skill yang diisi
# manual. Salah kelompok = dinilai orang yang bukan ketuanya.
#
# Baris penilaian_pedagogis TIDAK ikut pindah: nilainya menempel ke pengajar,
# bukan ke kelompok. Riwayat aman; yang berubah hanya daftar anggota yang
# dilihat tiap ketua mulai bulan berjalan.
#
# TIDAK dikerjakan di sini (sengaja):
#   - 10 akun aktif yang ada di DB tapi tidak tercantum di sheet (KEL 1 Nabila
#     Ulya & Silmi Muthmainnah bint Nazar Muharam; KEL 4 Adhwa Khoirunnisa &
#     Aulia Azizah; KEL 7 Royhana Safira Pardiani & Zakia Annajah; KEL 8 Iin
#     Dawani & Khasyi Hania Nataprawira; KEL 11 Nidya Haafizhah Shafa; KEL 13
#     Annisa Rizkya). Sheet tidak menyebut mereka — itu belum tentu berarti
#     dikeluarkan, jadi kelompoknya dibiarkan.
#   - Nama di sheet yang tak punya akun aktif: Fathia Ramadhita (akun ada,
#     active=false, sudah di KEL 2), Nafa Dzillah Arfania (tak ada akun),
#     "Aisyah (Maahir 6)" (kemungkinan Aisyah binti Ahmad yang memang sudah di
#     KEL 6). Atas keputusan koordinator, dibiarkan apa adanya.
#
# Tiap statement menyasar SATU orang lewat nama (unik di antara akhwat: sudah
# dicek 0 nama kembar) dan dijaga `not is_ketua` supaya tak ada ketua yang
# ikut terpindah. Harapan: 1 baris per statement, 19 statement.
# ---------------------------------------------------------------------------
set -euo pipefail

db() { npm run -s db -- --confirm "$1"; }

# `and exists (...)` itu pengaman: tanpa itu, nama kelompok yang meleset bikin
# subquery NULL dan pengajarnya justru terlempar keluar dari semua kelompok.
# Dengan penjaga ini, tujuan yang tak ditemukan = 0 baris, bukan kerusakan.
pindah() { # pindah "<nama pengajar>" <nomor kelompok tujuan>
  db "update pengajar set kelompok_id = (select id from kelompok_pengajar where name = 'Kelompok $2 Akhwat' and gender = 'akhwat') where gender = 'akhwat' and not is_ketua and name = '$1' and exists (select 1 from kelompok_pengajar where name = 'Kelompok $2 Akhwat' and gender = 'akhwat')"
}

# → KEL 1
pindah "Aisyah binti Muhammad" 1          # dari KEL 3
pindah "Atikah Az Zahwa" 1                # dari KEL 7
pindah "Sabaul Masani" 1                  # dari KEL 6
# → KEL 2
pindah "Afifah Al Ma''ruf" 2              # dari KEL 6
pindah "Nur Layla" 2                      # dari KEL 1
# → KEL 3
pindah "Nur Fidha Alifa" 3                # dari KEL 1
# → KEL 4
pindah "Ratu Sabbih Bilhaqiqi" 4          # dari KEL 13
pindah "Khansa Fauziah" 4                 # dari KEL 9
# → KEL 5
pindah "Aisyah Nuraini" 5                 # dari KEL 10
pindah "Salma Suhailah Nizzati" 5         # dari KEL 8
# → KEL 6
pindah "Tsalatsa Maghfira Al Biruni" 6    # dari KEL 12
# → KEL 7
pindah "Nabilla Putri Hasdar" 7           # dari KEL 12
pindah "Lubna Rohmayanti" 7               # dari KEL 5
# → KEL 8
pindah "Istiqomah Islamiyah" 8            # dari KEL 5
pindah "Arisatul Lailin Nikmah" 8         # dari KEL 5
pindah "Salma Khoiriyah" 8                # dari KEL 12
# → KEL 9
pindah "Nawal Misy''al" 9                 # dari KEL 12
# → KEL 12
pindah "Jenifier Imania Homalilo" 12      # dari KEL 9
# → KEL 13
pindah "Putri Wahyuningsih" 13            # dari KEL 6

# ---- Verifikasi ----
# Jumlah anggota per kelompok SETELAH pemindahan. Angka yang diharapkan
# (termasuk ketua), dan selisihnya terhadap sheet sudah terjelaskan seluruhnya
# oleh 10 akun di luar sheet + 2 nama sheet tanpa akun aktif:
#   KEL 1 =10 (sheet 8, +2 di luar sheet)   KEL 8 =10 (sheet 8, +2)
#   KEL 2 = 7 (sheet 8, Fathia nonaktif)    KEL 9 = 8 (sama)
#   KEL 3 = 8 (sama)                        KEL 10= 8 (sama)
#   KEL 4 = 9 (sheet 8, +2, −Nafa Dzillah)  KEL 11= 9 (sheet 8, +1)
#   KEL 5 = 7 (sama)                        KEL 12= 8 (sama)
#   KEL 6 = 7 (sama)                        KEL 13= 9 (sheet 8, +1)
#   KEL 7 = 9 (sheet 7, +2)                 total dalam kelompok = 109
npm run -s db "select k.name as kelompok, count(*) filter (where p.is_ketua) as ketua, count(*) as total, string_agg(p.name, ', ' order by p.is_ketua desc, p.name) as isi from kelompok_pengajar k left join pengajar p on p.kelompok_id = k.id and p.active where k.gender = 'akhwat' group by k.id, k.name order by k.name"
# Tiap kelompok wajib punya tepat 1 ketua; hasil query ini harus 0 baris.
npm run -s db "select k.name as kelompok, count(*) filter (where p.is_ketua) as ketua from kelompok_pengajar k left join pengajar p on p.kelompok_id = k.id and p.active where k.gender = 'akhwat' and k.name not ilike 'Belum Ada Kelompok%' group by k.id, k.name having count(*) filter (where p.is_ketua) <> 1"
