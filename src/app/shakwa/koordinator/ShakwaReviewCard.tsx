'use client';

import { useState, useTransition } from 'react';
import { updateShakwaStatus } from './actions';
import { KATEGORI_LABELS } from '@/lib/shakwa-constants';
import type { StatusShakwa } from '@/types/db';

interface ShakwaItem {
  id: string;
  pelapor_type: string;
  nama: string;
  gender: string;
  kategori: string;
  halaqoh: string | null;
  isi: string;
  saran_kritik: string | null;
  status: string;
  catatan_reviewer: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  submitted: { bg: 'var(--kuning-tint)', border: 'var(--kuning-line)', color: 'var(--kuning-ink)' },
  in_review: { bg: 'var(--surface-3)', border: 'var(--line)', color: 'var(--muted)' },
  resolved: { bg: 'var(--hijau-tint)', border: 'var(--hijau-line)', color: 'var(--hijau-ink)' },
  closed: { bg: 'var(--surface-3)', border: 'var(--line)', color: 'var(--muted-2)' },
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Baru',
  in_review: 'Ditinjau',
  resolved: 'Selesai',
  closed: 'Ditutup',
};

export function ShakwaReviewCard({ shakwa }: { shakwa: ShakwaItem }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; ok?: boolean }>();

  const sc = STATUS_COLORS[shakwa.status] ?? STATUS_COLORS.submitted;
  const kategoriLabel = KATEGORI_LABELS[shakwa.kategori] ?? shakwa.kategori;
  const date = new Date(shakwa.created_at).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });

  function handleSubmit(fd: FormData) {
    setResult(undefined);
    startTransition(async () => {
      const res = await updateShakwaStatus(undefined, fd);
      setResult(res);
    });
  }

  return (
    <div className="card-flat" style={{ marginBottom: 8 }}>
      <div
        style={{
          padding: '10px 14px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {shakwa.nama}
            <span className="t-small" style={{ fontWeight: 400, color: 'var(--muted-2)', marginLeft: 8 }}>
              {shakwa.pelapor_type === 'pengajar' ? 'Pengajar' : 'Peserta'}
            </span>
          </div>
          <div className="t-small" style={{ color: 'var(--muted-2)' }}>
            {kategoriLabel}
            {shakwa.halaqoh ? ` · ${shakwa.halaqoh}` : ''}
            {` · ${date}`}
          </div>
        </div>
        <span
          className="badge"
          style={{ background: sc.bg, borderColor: sc.border, color: sc.color }}
        >
          {STATUS_LABELS[shakwa.status] ?? shakwa.status}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--line-2)' }}>
          <div style={{ marginTop: 12 }}>
            <div className="t-small" style={{ fontWeight: 600, marginBottom: 4 }}>Isi Laporan</div>
            <div className="t-small" style={{ whiteSpace: 'pre-wrap', color: 'var(--foreground)' }}>
              {shakwa.isi}
            </div>
          </div>

          {shakwa.saran_kritik && (
            <div style={{ marginTop: 12 }}>
              <div className="t-small" style={{ fontWeight: 600, marginBottom: 4 }}>Saran & Kritik</div>
              <div className="t-small" style={{ whiteSpace: 'pre-wrap', color: 'var(--foreground)' }}>
                {shakwa.saran_kritik}
              </div>
            </div>
          )}

          {shakwa.catatan_reviewer && (
            <div style={{ marginTop: 12 }}>
              <div className="t-small" style={{ fontWeight: 600, marginBottom: 4 }}>Catatan Reviewer</div>
              <div className="t-small" style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>
                {shakwa.catatan_reviewer}
              </div>
            </div>
          )}

          <form action={handleSubmit} style={{ marginTop: 16 }}>
            <input type="hidden" name="shakwa_id" value={shakwa.id} />

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select name="status" defaultValue={shakwa.status} className="chip-select" style={{ flex: 1 }}>
                <option value="submitted">Baru</option>
                <option value="in_review">Ditinjau</option>
                <option value="resolved">Selesai</option>
                <option value="closed">Ditutup</option>
              </select>
              <button type="submit" className="btn btn-sm" disabled={pending}>
                {pending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>

            <textarea
              name="catatan_reviewer"
              placeholder="Catatan reviewer (opsional)"
              className="textarea"
              rows={2}
              defaultValue={shakwa.catatan_reviewer ?? ''}
              style={{ width: '100%' }}
            />

            {result?.error && (
              <p className="t-small" style={{ color: 'var(--danger)', marginTop: 4 }}>{result.error}</p>
            )}
            {result?.ok && (
              <p className="t-small" style={{ color: 'var(--success, #4caf50)', marginTop: 4 }}>Berhasil disimpan.</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
