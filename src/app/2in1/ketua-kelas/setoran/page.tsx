import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaWakilKelas, isTakhassusKelas } from '@/lib/program-kelas';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { berlakuPeriodeBerjalan, getSetoranTargets, targetResolver } from '@/lib/setoran-target';
import { todayJakarta } from '@/lib/anggota-periode';
import { Icon } from '@/components/icons';
import { SetoranGrid, type GridPertemuan, type GridPeserta } from './SetoranGrid';
import { TargetPesertaPanel, type TargetBaris } from './TargetPesertaPanel';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

/**
 * Rentang pengisian setoran = periode laporan berjalan saja (28 bulan lalu s/d
 * 27 bulan ini).
 *
 * Dulu DUA periode dibuka supaya pertemuan sebelum tanggal 28 masih bisa
 * disusulkan. Kebijakan rapat Agustus 2026 meniadakan alasan itu: begitu
 * tanggal 28 lewat, periode lama terkunci di semua jalur tulis (lihat
 * presensiTerbuka di periode-laporan.ts). Membuka dua periode di sini hanya
 * akan menampilkan pertemuan yang tombol simpannya pasti ditolak server.
 */
const PERIODE_DIBUKA = 1;

function periodeRange(month: string): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const startD = new Date(Date.UTC(y, m - 1 - PERIODE_DIBUKA, 28));
  const start = startD.toISOString().slice(0, 10);
  const end = `${y}-${String(m).padStart(2, '0')}-27`;
  const f = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
  return { start, end, label: `${f(start)} – ${f(end)}` };
}

export default async function SetoranKetuaPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const semuaKelas = await findKetuaWakilKelas(wa);
  if (semuaKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Halaman ini hanya untuk Ketua / Wakil Ketua Kelas.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ marginTop: 16 }}>← Kembali</Link>
      </main>
    );
  }

  // Setoran hafalan hanya untuk kelas Takhassus — kelas Maahir lain tak menyetor.
  const myKelas = semuaKelas.filter((k) => isTakhassusKelas(k.name));
  if (myKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Kelas ini tidak mengisi setoran hafalan. Setoran hanya untuk Maahir
          Takhassus Ikhwan &amp; Akhwat.
        </p>
        <Link href="/2in1/ketua-kelas" className="btn btn-ghost" style={{ marginTop: 16 }}>← Kembali</Link>
      </main>
    );
  }

  const nowMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const { start, end, label } = periodeRange(month);

  const kelasIds = myKelas.map((k) => k.id);
  const { data: pertemuanRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('program', 'kelas_maahir')
    .gte('tanggal', start)
    .lte('tanggal', end)
    .order('tanggal');
  const pertemuanList = (pertemuanRows ?? []) as Array<{
    id: string; program_kelas_id: string; tanggal: string;
  }>;

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name')
    .in('program_kelas_id', kelasIds)
    .eq('active', true)
    .order('name');
  const anggotaList = (anggotaRows ?? []) as Array<{
    id: string; program_kelas_id: string; name: string;
  }>;

  const pertemuanIds = pertemuanList.map((p) => p.id);
  const { data: kehadiranRows } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('pertemuan_id, anggota_id, status, setoran_halaman')
    .in('pertemuan_id', pertemuanIds.length ? pertemuanIds : ['00000000-0000-0000-0000-000000000000']);
  const kehadiranByKey = new Map(
    (kehadiranRows ?? [])
      .filter((k) => k.anggota_id)
      .map((k) => [
        `${k.pertemuan_id}|${k.anggota_id}`,
        { status: k.status as string, setoran: (k.setoran_halaman as number | null) ?? null },
      ])
  );

  const blocks = myKelas
    .map((k) => {
      const pert: GridPertemuan[] = pertemuanList
        .filter((p) => p.program_kelas_id === k.id)
        .map((p) => ({
          id: p.id,
          tanggal: p.tanggal,
          label: `${p.tanggal.slice(8, 10)}/${p.tanggal.slice(5, 7)}`,
        }));
      const pes: GridPeserta[] = anggotaList
        .filter((a) => a.program_kelas_id === k.id)
        .map((a) => ({
          id: a.id,
          name: a.name,
          sel: Object.fromEntries(
            pert.map((p) => {
              const row = kehadiranByKey.get(`${p.id}|${a.id}`);
              return [
                p.id,
                {
                  halaman: row?.setoran != null ? String(row.setoran) : '',
                  hadir: row?.status === 'hadir' || row?.status === 'terlambat',
                  adaPresensi: !!row,
                },
              ];
            })
          ),
        }));
      return { kelas: k, pert, pes };
    })
    .filter((b) => b.pert.length > 0 && b.pes.length > 0);

  // Target hafalan harian per peserta. Dipisah dari `blocks` supaya panelnya
  // tetap muncul pada bulan yang belum punya pertemuan sama sekali — target
  // justru paling perlu dipasang sebelum kelas berjalan.
  const targetRows = await getSetoranTargets(kelasIds);
  const hariIni = todayJakarta();
  const berlakuPada = targetResolver(targetRows);
  const berlakuLabel = new Date(berlakuPeriodeBerjalan() + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const targetBlocks = myKelas
    .map((k) => ({
      kelas: k,
      baris: anggotaList
        .filter((a) => a.program_kelas_id === k.id)
        .map((a): TargetBaris => {
          const nilai = berlakuPada(k.id, a.id, hariIni);
          const punyaKoreksi = targetRows.some(
            (r) => r.anggotaId === a.id && r.berlakuMulai <= hariIni
          );
          return {
            anggotaId: a.id,
            name: a.name,
            nilai,
            sumberDefault: nilai !== null && !punyaKoreksi,
          };
        }),
    }))
    .filter((b) => b.baris.length > 0);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Setoran Hafalan
          </div>
          <Link href="/2in1/ketua-kelas" className="back">{Icon.back(12)} Menu Ketua</Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h2" style={{ marginBottom: 2 }}>Isi setoran pertemuan yang lalu</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                {label} · isi jumlah halaman tiap peserta per pertemuan. Pertemuan
                lebih lama lagi: ganti bulan lewat dropdown di kanan.
              </p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
          </div>

          {targetBlocks.map((b) => (
            <TargetPesertaPanel
              key={b.kelas.id}
              kelasId={b.kelas.id}
              kelasName={b.kelas.name}
              baris={b.baris}
              berlakuLabel={berlakuLabel}
            />
          ))}

          {blocks.length === 0 ? (
            <div className="card-flat" style={{ padding: 20 }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Belum ada pertemuan Kelas Maahir pada periode ini.
              </p>
            </div>
          ) : (
            blocks.map((b) => (
              <section key={b.kelas.id} style={{ marginBottom: 24 }}>
                <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
                  {b.kelas.name.toUpperCase()} · {b.pert.length} pertemuan · {b.pes.length} peserta
                </div>
                <SetoranGrid pertemuan={b.pert} peserta={b.pes} />
              </section>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
