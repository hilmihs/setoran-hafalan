import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa } from '@/lib/program-kelas';
import { getUnfilledMaahirDays, PROGRAM_LABEL, weekRangeLabel } from '@/lib/maahir-presensi';
import { PresensiWizardForm } from './PresensiWizardForm';
import { LogoutButton } from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function PresensiWizardPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const unfilled = await getUnfilledMaahirDays(wa);
  if (unfilled.length === 0) redirect('/2in1/ketua-kelas');

  const day = unfilled[0];
  const total = day.totalRemaining;

  // Pastikan pertemuan ada untuk hari paling lama (ketua sudah terverifikasi WA).
  const { data: pertemuan, error: pErr } = await supabaseAdmin
    .from('pertemuan_program')
    .upsert(
      {
        program_kelas_id: day.program_kelas_id,
        program: day.program,
        tanggal: day.tanggal,
        nama_kegiatan: day.namaKegiatan,
        waktu_mulai: day.waktu_mulai,
        waktu_selesai: day.waktu_selesai,
      },
      { onConflict: 'program_kelas_id,program,tanggal', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (pErr || !pertemuan) {
    return (
      <main style={{ padding: 24 }}>
        <div className="banner banner-error">
          <div className="desc">Gagal menyiapkan pertemuan: {pErr?.message ?? 'unknown'}</div>
        </div>
      </main>
    );
  }

  // Anggota kelas + status kehadiran existing (kalau pertemuan sudah pernah dibuat tapi belum disubmit).
  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, name, is_ketua, is_wakil')
    .eq('program_kelas_id', day.program_kelas_id)
    .order('name');

  const { data: existing } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('anggota_id, status, catatan')
    .eq('pertemuan_id', pertemuan.id);

  const existingMap = new Map<string, { status: string; catatan: string | null }>(
    (existing ?? [])
      .filter((k) => k.anggota_id)
      .map((k) => [k.anggota_id as string, { status: k.status, catatan: k.catatan }])
  );

  type StatusType = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';
  const pesertaRows = (anggotaList ?? []).map((a) => ({
    id: a.id,
    name: a.name + (a.is_ketua ? ' (Ketua)' : a.is_wakil ? ' (Wakil)' : ''),
    status: (existingMap.get(a.id)?.status ?? 'hadir') as StatusType,
    catatan: existingMap.get(a.id)?.catatan ?? '',
  }));

  // Mingguan (mis. Alumni/Talaqqi): tampil sebagai rentang pekan, bukan hari Senin spesifik.
  const tanggalLabel = day.mingguan
    ? weekRangeLabel(day.tanggal)
    : new Date(day.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
  // Slot mingguan bukan sesi jam tertentu → sembunyikan rentang jam.
  const timeRange =
    !day.mingguan && day.waktu_mulai
      ? `${day.waktu_mulai.slice(0, 5)}${day.waktu_selesai ? ' – ' + day.waktu_selesai.slice(0, 5) : ''}`
      : null;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Presensi Wajib
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/2in1/ketua-kelas" className="btn btn-sm btn-ghost">← Menu Utama</Link>
            <LogoutButton />
          </div>
        </div>
        <div className="page">
          <div
            className="card"
            style={{
              padding: '12px 14px',
              marginBottom: 14,
              borderLeft: '3px solid var(--accent)',
              background: 'var(--surface-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {PROGRAM_LABEL[day.program] ?? day.program}
              </div>
              <span className="badge badge-kuning">
                <span className="dot" /> Sisa {total}
              </span>
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              {day.kelasName}
            </div>
            <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
              {tanggalLabel}
              {timeRange ? ` · ${timeRange}` : ''}
            </div>
          </div>

          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
            {day.mingguan
              ? 'Cukup 1× per pekan — isi kehadiran anggota untuk pekan ini (hadir di hari mana pun Senin–Jum’at dihitung). Setelah disimpan, lanjut ke pekan berikutnya yang belum terisi.'
              : 'Isi kehadiran anggota untuk hari ini. Setelah disimpan, lanjut otomatis ke hari berikutnya yang belum terisi.'}
          </p>

          <PresensiWizardForm
            key={pertemuan.id}
            pertemuanId={pertemuan.id}
            pesertaList={pesertaRows}
            remaining={total}
          />
        </div>
      </div>
    </main>
  );
}
