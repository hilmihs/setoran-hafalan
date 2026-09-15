#!/usr/bin/env bash
# Rilis 0076 ke PRODUKSI lewat /api/admin/db — satu statement per panggilan
# (endpoint membungkus transaksinya sendiri; statement berat bikin 502).
# Jalankan dari root repo SETELAH kode ter-deploy. Idempoten: aman diulang.
# Nomor WA tidak ditulis di sini — seed menyalin dari baris koordinator/pengajar
# yang sudah ada (dicocokkan lewat id).
set -euo pipefail
db() { npm run -s db -- --confirm "$1"; }

# ---- DDL ----
db "CREATE TABLE IF NOT EXISTS maahir_pengajar (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, gender text NOT NULL CHECK (gender IN ('ikhwan','akhwat')), whatsapp_number text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())"
db "CREATE TABLE IF NOT EXISTS maahir_pengajar_kelas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pengajar_id uuid NOT NULL REFERENCES maahir_pengajar(id) ON DELETE CASCADE, program_kelas_id uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (pengajar_id, program_kelas_id))"
db "CREATE INDEX IF NOT EXISTS idx_maahir_pengajar_kelas_kelas ON maahir_pengajar_kelas(program_kelas_id)"
db "CREATE TABLE IF NOT EXISTS maahir_checkin_pengajar (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pengajar_id uuid NOT NULL REFERENCES maahir_pengajar(id) ON DELETE CASCADE, program_kelas_id uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE, tanggal date NOT NULL, status text NOT NULL CHECK (status IN ('hadir','izin','sakit')), checked_in_at timestamptz NOT NULL DEFAULT now(), susulan boolean NOT NULL DEFAULT false, materi text, catatan text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (pengajar_id, program_kelas_id, tanggal))"
db "CREATE INDEX IF NOT EXISTS idx_maahir_checkin_pengajar_tanggal ON maahir_checkin_pengajar(tanggal DESC)"
db "ALTER TABLE koordinator ADD COLUMN IF NOT EXISTS rekap_pengajar_maahir boolean NOT NULL DEFAULT false"
db "ALTER TABLE maahir_pengajar ENABLE ROW LEVEL SECURITY"
db "ALTER TABLE maahir_pengajar_kelas ENABLE ROW LEVEL SECURITY"
db "ALTER TABLE maahir_checkin_pengajar ENABLE ROW LEVEL SECURITY"

# ---- Seed pengajar (WA disalin dari akun yang sudah ada) ----
db "INSERT INTO maahir_pengajar (name, gender, whatsapp_number) SELECT 'Ustadzah Salma', 'akhwat', whatsapp_number FROM koordinator WHERE id = '275bf95d-e3ad-4447-b48a-88d6f518f833' ON CONFLICT (whatsapp_number) DO NOTHING"
db "INSERT INTO maahir_pengajar (name, gender, whatsapp_number) SELECT 'Ustadzah Radiatam Mardhiyah', 'akhwat', whatsapp_number FROM koordinator WHERE id = 'b37c85ce-b7f8-42f2-af21-3ac81a2b10c5' ON CONFLICT (whatsapp_number) DO NOTHING"
db "INSERT INTO maahir_pengajar (name, gender, whatsapp_number) SELECT 'Ustadzah Ruqayyah', 'akhwat', whatsapp_number FROM pengajar WHERE id = '151f5159-3fb8-4be8-81ec-db8bc54933ee' ON CONFLICT (whatsapp_number) DO NOTHING"

# ---- Pemetaan kelas (Salma: 6C & 6D; Radiatam: 6A; Ruqayyah: 6B) ----
db "INSERT INTO maahir_pengajar_kelas (pengajar_id, program_kelas_id) SELECT p.id, k.id FROM maahir_pengajar p JOIN koordinator c ON c.whatsapp_number = p.whatsapp_number AND c.id = '275bf95d-e3ad-4447-b48a-88d6f518f833' JOIN program_kelas k ON k.id IN ('2f6a4e62-bcbf-4a92-a5ac-5b2ce2ee6c9b','92630fd5-4e36-497a-9e0b-beecb0843517') ON CONFLICT DO NOTHING"
db "INSERT INTO maahir_pengajar_kelas (pengajar_id, program_kelas_id) SELECT p.id, '252872c9-5497-402c-a89a-5b6bd813d80e' FROM maahir_pengajar p JOIN koordinator c ON c.whatsapp_number = p.whatsapp_number AND c.id = 'b37c85ce-b7f8-42f2-af21-3ac81a2b10c5' ON CONFLICT DO NOTHING"
db "INSERT INTO maahir_pengajar_kelas (pengajar_id, program_kelas_id) SELECT p.id, '2a7bc894-7f6a-4792-950d-718e22201948' FROM maahir_pengajar p JOIN pengajar g ON g.whatsapp_number = p.whatsapp_number AND g.id = '151f5159-3fb8-4be8-81ec-db8bc54933ee' ON CONFLICT DO NOTHING"

# ---- Pemantau rekap: Wilda, Salma, Ahmad Abdus Syukur, Abdul Muhsin ----
db "UPDATE koordinator SET rekap_pengajar_maahir = true WHERE id IN ('99081d46-3d86-4eef-8525-76a79f0a23d4','275bf95d-e3ad-4447-b48a-88d6f518f833','801969b9-3ad7-4ef5-b68d-b9a89d1bca8b','2d0ffcd9-4eb5-419b-a35f-001fdbf7ded4')"

# ---- Verifikasi (READ) ----
npm run -s db "SELECT p.name, string_agg(k.name, ', ' ORDER BY k.waktu_mulai) kelas FROM maahir_pengajar p LEFT JOIN maahir_pengajar_kelas pk ON pk.pengajar_id = p.id LEFT JOIN program_kelas k ON k.id = pk.program_kelas_id GROUP BY p.name ORDER BY p.name"
npm run -s db "SELECT name FROM koordinator WHERE rekap_pengajar_maahir ORDER BY name"
