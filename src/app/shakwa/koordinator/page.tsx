import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { getShakwaRekap, type ShakwaItem } from '@/lib/shakwa-rekap';
import { signedLampiranUrls } from '@/lib/shakwa-storage';
import { KATEGORI, STATUS_LABEL, type ShakwaKategori, type ShakwaStatus } from '@/lib/shakwa';
import { buildWaMeUrl, tplShakwaBalasPelapor, tplShakwaRekapHarian } from '@/lib/whatsapp';
import { todayJakartaISO } from '@/lib/hits-observasi';
import { absUrl } from '@/lib/url';
import { ShakwaTindakForm } from './ShakwaTindakForm';
import { SalinRekapButton } from './SalinRekapButton';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_WARNA: Record<ShakwaStatus, { bg: string; bd: string; ink: string }> = {
  submitted: { bg: 'var(--merah-tint)', bd: 'var(--merah-line)', ink: 'var(--merah-ink)' },
  in_review: { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' },
  resolved: { bg: 'var(--hijau-tint)', bd: 'var(--hijau-line)', ink: 'var(--hijau-ink)' },
  closed: { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--muted)' },
};

function mundurHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - hari);
  return d.toISOString().slice(0, 10);
}

/** Dashboard aduan Shakwa + rekap harian untuk koordinator. */
export default async function ShakwaKoordinatorPage({
  searchParams,
}: {
  searchParams: { tanggal?: string; dari?: string; sampai?: string; kategori?: string; status?: string; gender?: string };
}) {
  await requireKoordinator();

  const hariIni = todayJakartaISO();
  const tanggal = DATE_RE.test(searchParams.tanggal ?? '') ? (searchParams.tanggal as string) : hariIni;
  const dari = DATE_RE.test(searchParams.dari ?? '') ? (searchParams.dari as string) : undefined;
  const sampai = DATE_RE.test(searchParams.sampai ?? '') ? (searchParams.sampai as string) : undefined;
  const kategori = KATEGORI.some((k) => k.value === searchParams.kategori)
    ? (searchParams.kategori as ShakwaKategori)
    : undefined;
  const status = ['submitted', 'in_review', 'resolved', 'closed'].includes(searchParams.status ?? '')
    ? (searchParams.status as ShakwaStatus)
    : undefined;
  const gender =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? (searchParams.gender as Gender)
      : undefined;

  const rentangPenuh = dari && sampai;
  const rekap = await getShakwaRekap({
    tanggal: rentangPenuh ? undefined : tanggal,
    dari,
    sampai,
    kategori,
    status,
    gender,
  });

  // Lampiran: URL bertanda tangan dibuat sesaat, hanya untuk halaman ini.
  const lampiranByItem = new Map<string, Array<{ path: string; url: string | null }>>();
  await Promise.all(
    rekap.items
      .filter((i) => i.lampiran.length)
      .map(async (i) => {
        lampiranByItem.set(i.id, await signedLampiranUrls(i.lampiran));
      })
  );

  const periodeLabel = rekap.mulai === rekap.sampai ? rekap.mulai : `${rekap.mulai} → ${rekap.sampai}`;
  const teksRekap = tplShakwaRekapHarian({
    tanggalLabel: periodeLabel,
    total: rekap.total,
    perKategori: rekap.perKategori.map((k) => ({ label: k.label, jumlah: k.jumlah })),
    belumDitangani: rekap.belumDitangani,
    dashboardUrl: absUrl('/shakwa/koordinator'),
  });

  const balasUrl = (i: ShakwaItem) =>
    i.pelapor_wa
      ? buildWaMeUrl(
          i.pelapor_wa,
          tplShakwaBalasPelapor({ nama: i.nama, nomorTiket: i.nomorTiket, kategoriLabel: i.kategoriLabel })
        )
      : null;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">S</span> Shakwa
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SalinRekapButton teks={teksRekap} />
            <Link
              href="/shakwa"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              Buka formulir
            </Link>
          </div>
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Rekap Shakwa
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            {periodeLabel} · {rekap.total} laporan · {rekap.belumDitangani} belum ditangani
          </p>

          {/* Penyaring — form GET biasa supaya hasilnya bisa ditandai/di-bookmark. */}
          <form
            method="get"
            className="card-flat"
            style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            <div>
              <label className="t-tiny" htmlFor="f-tanggal" style={{ display: 'block', color: 'var(--muted-2)' }}>
                Tanggal
              </label>
              <input id="f-tanggal" type="date" name="tanggal" defaultValue={rentangPenuh ? '' : tanggal} className="input" style={{ height: 32 }} />
            </div>
            <div>
              <label className="t-tiny" htmlFor="f-dari" style={{ display: 'block', color: 'var(--muted-2)' }}>
                Rentang dari
              </label>
              <input id="f-dari" type="date" name="dari" defaultValue={dari ?? ''} className="input" style={{ height: 32 }} />
            </div>
            <div>
              <label className="t-tiny" htmlFor="f-sampai" style={{ display: 'block', color: 'var(--muted-2)' }}>
                sampai
              </label>
              <input id="f-sampai" type="date" name="sampai" defaultValue={sampai ?? ''} className="input" style={{ height: 32 }} />
            </div>
            <div>
              <label className="t-tiny" htmlFor="f-kategori" style={{ display: 'block', color: 'var(--muted-2)' }}>
                Kategori
              </label>
              <select id="f-kategori" name="kategori" defaultValue={kategori ?? ''} className="input" style={{ height: 32 }}>
                <option value="">Semua</option>
                {KATEGORI.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="t-tiny" htmlFor="f-status" style={{ display: 'block', color: 'var(--muted-2)' }}>
                Status
              </label>
              <select id="f-status" name="status" defaultValue={status ?? ''} className="input" style={{ height: 32 }}>
                <option value="">Semua</option>
                <option value="submitted">Baru</option>
                <option value="in_review">Diproses</option>
                <option value="resolved">Selesai</option>
              </select>
            </div>
            <div>
              <label className="t-tiny" htmlFor="f-gender" style={{ display: 'block', color: 'var(--muted-2)' }}>
                Gender
              </label>
              <select id="f-gender" name="gender" defaultValue={gender ?? ''} className="input" style={{ height: 32 }}>
                <option value="">Semua</option>
                <option value="ikhwan">Ikhwan</option>
                <option value="akhwat">Akhwat</option>
              </select>
            </div>
            <button type="submit" className="btn btn-sm btn-primary" style={{ height: 32 }}>
              Terapkan
            </button>
            <Link href="/shakwa/koordinator" className="t-tiny" style={{ color: 'var(--muted-2)', alignSelf: 'center' }}>
              Reset
            </Link>
          </form>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <Link href={`?tanggal=${hariIni}`} className="chip-select">
              Hari ini
            </Link>
            <Link href={`?dari=${mundurHari(hariIni, 6)}&sampai=${hariIni}`} className="chip-select">
              7 hari terakhir
            </Link>
            <Link href={`?tanggal=${hariIni}&status=submitted`} className="chip-select">
              Belum ditangani
            </Link>
          </div>

          {rekap.perKategori.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {rekap.perKategori.map((k) => (
                <span key={k.kategori} className="badge">
                  {k.label}: {k.jumlah}
                </span>
              ))}
            </div>
          )}

          {rekap.items.length === 0 ? (
            <div className="card-flat" style={{ padding: '32px 24px', textAlign: 'center' }}>
              <p className="t-h3" style={{ marginBottom: 4 }}>
                Tak ada laporan
              </p>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tidak ada aduan Shakwa pada periode &amp; penyaring ini.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rekap.items.map((i) => {
                const warna = STATUS_WARNA[i.status];
                const wa = balasUrl(i);
                const lampiran = lampiranByItem.get(i.id) ?? [];
                return (
                  <div
                    key={i.id}
                    className="card-flat"
                    style={{ padding: '14px 16px', borderLeft: `3px solid ${warna.bd}` }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <div>
                        <span className="t-mono t-tiny" style={{ color: 'var(--muted-2)' }}>
                          {i.nomorTiket}
                        </span>
                        <div style={{ fontWeight: 600 }}>
                          {i.kategoriLabel} · {i.nama}
                        </div>
                        <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                          {i.halaqahLabel} · {i.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} ·{' '}
                          {new Date(i.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                          {i.pengajarNama ? ` · pengajar: ${i.pengajarNama}` : ''}
                        </div>
                      </div>
                      <span
                        className="badge"
                        style={{ background: warna.bg, borderColor: warna.bd, color: warna.ink, height: 22 }}
                      >
                        {STATUS_LABEL[i.status]}
                      </span>
                    </div>

                    <p className="t-small" style={{ whiteSpace: 'pre-line', marginBottom: 8 }}>
                      {i.isi}
                    </p>

                    {Object.keys(i.jawaban).length > 0 && (
                      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                        {Object.entries(i.jawaban).map(([k, v]) => (
                          <div key={k}>
                            {k.replace(/_/g, ' ')}: <strong>{v}</strong>
                          </div>
                        ))}
                      </div>
                    )}

                    {i.izin.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div className="t-tiny" style={{ fontWeight: 600, marginBottom: 2 }}>
                          Rincian izin
                        </div>
                        {i.izin.map((z, idx) => (
                          <div key={idx} className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                            {z.tanggal} · {z.jenisLabel}
                            {z.menit != null ? ` · ${z.menit} menit` : ''}
                            {z.jadwalGanti ? ` · diganti ${z.jadwalGanti}` : ''}
                            {z.halaqahName ? ` · ${z.halaqahName}` : ' · semua halaqah'}
                            {z.sudahTerpakai ? ' · sudah menempel ke tabayyun' : ''}
                          </div>
                        ))}
                      </div>
                    )}

                    {lampiran.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        {lampiran.map((l, idx) =>
                          l.url ? (
                            <a
                              key={l.path}
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="t-tiny"
                              style={{ color: 'var(--accent)' }}
                            >
                              Lampiran {idx + 1}
                            </a>
                          ) : (
                            <span key={l.path} className="t-tiny" style={{ color: 'var(--muted)' }}>
                              Lampiran {idx + 1} (gagal dibuka)
                            </span>
                          )
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="t-tiny" style={{ color: 'var(--hijau-ink)' }}>
                          Balas via WhatsApp
                        </a>
                      ) : (
                        <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                          Nomor WA pelapor tak diisi
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                      <ShakwaTindakForm id={i.id} status={i.status} catatan={i.catatanKoordinator} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
