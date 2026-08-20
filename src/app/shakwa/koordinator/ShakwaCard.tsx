import { STATUS_LABEL, type ShakwaStatus } from '@/lib/shakwa';
import type { ShakwaItem } from '@/lib/shakwa-rekap';
import { waktuRelatif } from './ui-helpers';
import { ShakwaTindakForm } from './ShakwaTindakForm';

const STATUS_WARNA: Record<ShakwaStatus, { bg: string; bd: string; ink: string }> = {
  submitted: { bg: 'var(--merah-tint)', bd: 'var(--merah-line)', ink: 'var(--merah-ink)' },
  in_review: { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' },
  resolved: { bg: 'var(--hijau-tint)', bd: 'var(--hijau-line)', ink: 'var(--hijau-ink)' },
  closed: { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--muted)' },
};

/** Satu kartu aduan Shakwa untuk dashboard koordinator (presentational). */
export function ShakwaCard({
  item,
  lampiran,
  waUrl,
}: {
  item: ShakwaItem;
  lampiran: Array<{ path: string; url: string | null }>;
  waUrl: string | null;
}) {
  const warna = STATUS_WARNA[item.status];
  const baru = item.status === 'submitted';
  const redup = item.status === 'resolved' || item.status === 'closed';
  const waktuAbsolut = new Date(item.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const isiPanjang = item.isi.length > 220;

  return (
    <div
      className="card-flat"
      style={{
        padding: '14px 16px',
        borderLeft: `3px solid ${warna.bd}`,
        ...(baru ? { background: 'var(--merah-tint)' } : null),
        ...(redup ? { opacity: 0.72 } : null),
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="t-mono t-tiny" style={{ color: 'var(--muted-2)' }}>
              {item.nomorTiket}
            </span>
            {baru && (
              <span
                className="badge t-tiny"
                style={{ background: 'var(--merah-line)', color: 'var(--merah-ink)', border: 'none', height: 16, padding: '0 6px' }}
              >
                BARU
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600 }}>
            {item.kategoriLabel} · {item.nama}
          </div>
          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
            {item.halaqahLabel} · {item.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} ·{' '}
            <span title={waktuAbsolut}>{waktuRelatif(item.createdAt)}</span>
            {item.pengajarNama ? ` · pengajar: ${item.pengajarNama}` : ''}
          </div>
        </div>
        <span
          className="badge"
          style={{ background: warna.bg, borderColor: warna.bd, color: warna.ink, height: 22 }}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {isiPanjang ? (
        <details style={{ marginBottom: 8 }}>
          <summary className="t-small" style={{ cursor: 'pointer', listStyle: 'none', color: 'var(--muted-2)' }}>
            {item.isi.slice(0, 200)}… selengkapnya
          </summary>
          <p className="t-small" style={{ whiteSpace: 'pre-line', marginTop: 6 }}>
            {item.isi}
          </p>
        </details>
      ) : (
        <p className="t-small" style={{ whiteSpace: 'pre-line', marginBottom: 8 }}>
          {item.isi}
        </p>
      )}

      {Object.keys(item.jawaban).length > 0 && (
        <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
          {Object.entries(item.jawaban).map(([k, v]) => (
            <div key={k}>
              {k.replace(/_/g, ' ')}: <strong>{v}</strong>
            </div>
          ))}
        </div>
      )}

      {item.izin.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="t-tiny" style={{ fontWeight: 600, marginBottom: 2 }}>
            Rincian izin
          </div>
          {item.izin.map((z, idx) => (
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
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="t-tiny" style={{ color: 'var(--hijau-ink)' }}>
            Balas via WhatsApp
          </a>
        ) : (
          <span className="t-tiny" style={{ color: 'var(--muted)' }}>
            Nomor WA pelapor tak diisi
          </span>
        )}
      </div>

      <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <ShakwaTindakForm id={item.id} status={item.status} catatan={item.catatanKoordinator} />
      </div>
    </div>
  );
}
