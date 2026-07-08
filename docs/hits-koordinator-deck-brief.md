# PROMPT KONTEN — Deck "HITS Observasi" untuk Tim Koordinator

> Handover ke **Claude Design**. Prompt **gaya visual & layout sudah ada terpisah**
> (PROMPT GAYA VISUAL HITS — band hijau, krem, emas, Nunito Sans, 8 slide).
> File ini **hanya isi konten** — tempelkan sesudah prompt visual.
> Ganti semua "Admin / Maahir" → **HITS · Tim Koordinator · Majelis Pendidikan**.

## Meta
- **Judul deck**: HITS Observasi — Update Sistem untuk Koordinator
- **Audiens**: Tim Koordinator HITS (bukan ustadz teknis; hindari jargon kode)
- **Tujuan**: jelaskan hasil transformasi observasi F0–F5 + cara pakai harian
- **Bahasa**: Indonesia · **Jumlah slide**: 8 (format "0X / 08") · 16:9
- **Tanggal**: 6 Juli 2026 · **Status**: Roadmap F0–F5 TUNTAS, dipakai di produksi
- **Nada kunci tiap slide**: satu blok "Untuk koordinator" = manfaat praktis

---

## SLIDE 1 — COVER
- Pil: **HITS**
- Eyebrow: PROGRAM OBSERVASI · RINGKASAN UNTUK KOORDINATOR
- Judul dua warna: **HITS** (putih) + **Observasi** (emas)
- Tagline: *Enam fase yang mengubah cara kita menilai kedisiplinan pengajar*
- Footer kiri: TIM KOORDINATOR HITS · MAJELIS PENDIDIKAN · Footer kanan: 6 JULI 2026
- Ikon hero: perisai + centang (disiplin terjaga)

## SLIDE 2 — INTI SISTEM (roadmap + loop 4 peran)
- Eyebrow: INTI SISTEM · Judul: **Satu lingkaran, empat peran**
- **Roadmap chevron** hijau→emas: F0 Perbaikan data · F1 Mesin observasi · F2 Hutang menit · F3 Tabayyun 72 jam · F4 Kajian adab · F5 Leaderboard
- **Loop 4 kartu** (panah antar kartu):
  1. **Ketua Kelas** — mencatat kondisi tiap pertemuan
  2. **Sistem** — hitung pelanggaran, hutang, timer
  3. **Koordinator** — tindak, tegur, putuskan udzur
  4. **Nilai Matrix** — skor disiplin terupdate otomatis
- Kalimat inti: *Koordinator ada di ujung — memutuskan, bukan mengumpulkan data.*

## SLIDE 3 — F1 · MESIN OBSERVASI
- Eyebrow: F1 · FONDASI · Judul: **Mencatat pelanggaran, bukan sekadar "hadir"**
- Kartu kiri (strip "Jenis pelanggaran"), pola lead-in—detail:
  - **KMT** — Kelas Mulai Terlambat (toleransi 5 menit)
  - **KBLA** — Kelas Berakhir Lebih Awal
  - **JKG** — Jadwal Kelas Ganti
  - **BADAL** — pengajar digantikan; guru asli dihitung mangkir
  - **KBBS** — nol pelanggaran = pertemuan bersih
- Kartu kanan (strip emas "Untuk koordinator"):
  - Satu pertemuan bisa punya **beberapa pelanggaran sekaligus** — ketua tinggal mencentang.
  - Setiap pertemuan punya **kategori jelas** yang dihitung otomatis jadi skor.

## SLIDE 4 — F2 · HUTANG MENIT
- Eyebrow: F2 · AKUNTABILITAS WAKTU · Judul: **Menit yang hilang jadi hutang yang tercatat**
- Kartu "Cara kerja" (lead-in—detail):
  - **Debit otomatis** — KMT = menit − 5 · KBLA = menit penuh · JKG = 1 pertemuan
  - **Cicilan** — ketua catat "pengajar menambah __ menit" → saldo turun
  - **Kumulatif** — saldo tak reset tiap minggu/bulan
  - **Mulai bersih** sejak 6 Juli 2026 — data lama tak dihukum
- **Big-number** emas: **6 Juli** / label TITIK MULAI SALDO BERSIH
- Caption: saldo hutang muncul di dashboard & disisipkan ke pesan WA tabayyun

## SLIDE 5 — F3 · TABAYYUN 72 JAM
- Eyebrow: F3 · ANTI-GHOSTING · Judul: **Klarifikasi yang tidak bisa didiamkan**
- Kartu "Alur tabayyun":
  - **Timer 72 jam** berjalan sejak pengingat pertama dikirim
  - **Ada alasan** → jalur keputusan udzur / non-udzur manual
  - **Diam > 72 jam = ghosting** → otomatis non-udzur + teguran + WA *(warna merah)*
  - **Tombol berubah**: Ingatkan → Ingatkan Lagi → Teguran Ghosting
- **Big-number** emas: **72** / label JAM BATAS SEBELUM GHOSTING
- **Panel peringatan merah**: *Koordinator = detak jantung. Eskalasi dievaluasi saat Anda membuka & menekan tombol tabayyun. Tidak ada cron — sistem bergerak saat Anda bertindak.*

## SLIDE 6 — F4 & F5 · PEMBINAAN & REPORT
- Eyebrow: F4 & F5 · PEMBINAAN & REPORT · Judul: **Kajian adab & leaderboard disiplin**
- Kartu kiri (strip hijau "F4 · Kajian Adab" + badge **BERJALAN**):
  - **Presensi ketua** kelas di kajian adab kini di dalam HITS
  - **Data historis** sudah dicocokkan (nama + tanggal)
  - **Bahan pembinaan** peran ketua kelas
- Kartu kanan (strip emas "F5 · Leaderboard" + badge **VIEW-ONLY**):
  - **Urutan** %KBBS terendah → hutang terbanyak → nama
  - **Per-pengajar**, gabung semua halaqah, lintas-batch
  - **Toggle** Bulanan / Mingguan (Senin–Minggu)
  - **Klik nama** → profil pengajar di matrix

## SLIDE 7 — ALUR KERJA HARIAN (agenda bernomor)
- Eyebrow: RUTINITAS HARIAN · Judul: **Alur kerja koordinator dalam 4 langkah**
  1. **Buka leaderboard disiplin** — lihat %KBBS terendah & hutang tertinggi · `/hits/koordinator`
  2. **Tindak lanjuti tabayyun tertunda** — ingatkan / Teguran Ghosting bila > 72 jam · `/observasi/koordinator`
  3. **Putuskan udzur / non-udzur** — nilai matrix mengikuti keputusan · `/matrix/koordinator/pengajar/[id]`
  4. **Pantau hutang & kajian adab** — ingatkan cicilan; cek presensi ketua · `/observasi/koordinator/kajian`

## SLIDE 8 — PENUTUP
- Eyebrow: ROADMAP F0–F5 TUNTAS · Judul: **Sistem yang mengingat, Anda yang membina**
- **Banner kunci** (dua warna): *Tugas koordinator bukan lagi __mengumpulkan catatan__ — melainkan __membaca papan peringkat__ dan mengambil keputusan.*
- Strip kamus 4 istilah: **KBBS** (Kelas Berjalan Baik & Sesuai) · **Tabayyun** (permintaan klarifikasi ke pengajar) · **Ghosting** (tabayyun didiamkan > 72 jam) · **Hutang menit** (saldo waktu tertunggak, bisa dicicil)

---

## LINK RUTE (untuk footer/rujukan & tombol demo)
| Fitur | Rute | Peran |
|---|---|---|
| Leaderboard disiplin (F5) | `/hits/koordinator` | Koordinator |
| Form input harian (F1/F2) | `/hits/ketua` | Ketua kelas |
| Tabayyun + Teguran Ghosting (F3) | `/observasi/koordinator` | Koordinator |
| Presensi kajian adab (F4) | `/observasi/koordinator/kajian` | Koordinator |
| Profil / nilai pengajar | `/matrix/koordinator/pengajar/[id]` | Koordinator |
| Validasi pertemuan | `/hits/koordinator/validasi` | Koordinator |

---

## SHOT-LIST SCREENSHOT APP (opsional — untuk memperkaya deck)
> Tangkap di layar penuh, sembunyikan data pribadi bila perlu. Slot per slide:

| Slot | Halaman | Rute | Yang disorot |
|---|---|---|---|
| Slide 3 | Form ketua | `/hits/ketua` | checkbox multi-pelanggaran (KMT/KBLA/JKG/BADAL) |
| Slide 4 | Form ketua / dashboard | `/hits/ketua`, `/hits/koordinator` | banner hutang + input cicilan menit; kolom saldo |
| Slide 5 | Tabayyun koordinator | `/observasi/koordinator` | kartu tabayyun, tombol Ingatkan→Teguran Ghosting |
| Slide 6 | Kajian adab + leaderboard | `/observasi/koordinator/kajian`, `/hits/koordinator` | tabel presensi; papan peringkat + toggle Bulanan/Mingguan |
| Slide 7 | Leaderboard | `/hits/koordinator` | tampilan awal rutinitas koordinator |

**Preview deck jadi (bisa dibawa)**: `docs/shot-01.png` … `docs/shot-08.png`
**Deck HTML siap presentasi**: `docs/hits-koordinator-deck.html` (← → navigasi · F fullscreen · Ctrl+P → PDF)
