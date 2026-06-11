'use client';

import { useEffect, useState } from 'react';
import { AudioRecorder } from './AudioRecorder';
import { Icon, Initials } from './icons';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';
import {
  saveRecording,
  deleteRecording,
  loadRecordings,
  clearRecordings,
} from '@/lib/recording-cache';

type Recordings = Record<JenisRekaman, { blob: Blob; durationSec: number } | null>;

const EMPTY: Recordings = {
  tuhfatul_athfal: null,
  jazariyyah: null,
  syawahid: null,
};

const JENIS_LABEL_FORM: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Asy-Syawahid',
};

export interface ExistingSetoran {
  id: string;
  status: 'submitted' | 'checked';
  musyrifWaUrl: string | null;
  rekaman: Array<{ jenis: JenisRekaman; nilai: NilaiRekaman | null; masukan: string | null }>;
}

export function PesertaSetoranForm({
  musyrifName,
  musyrifInitials,
  existing,
  endpoint = '/api/setoran/submit',
  targetRoleLabel = 'Musyrif kelas Anda',
  cacheKey,
}: {
  musyrifName: string;
  musyrifInitials: string;
  existing: ExistingSetoran | null;
  endpoint?: string;
  targetRoleLabel?: string;
  cacheKey?: string;
}) {
  const [recordings, setRecordings] = useState<Recordings>(EMPTY);
  const [initialRecordings, setInitialRecordings] = useState<Partial<Recordings>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultWaUrl, setResultWaUrl] = useState<string | null>(
    existing?.status === 'submitted' ? existing.musyrifWaUrl : null
  );

  useEffect(() => {
    if (!cacheKey) return;
    loadRecordings(cacheKey).then(setInitialRecordings);
  }, [cacheKey]);

  const doneCount = Object.values(recordings).filter(Boolean).length;
  const allRecorded = doneCount === 3;
  const checked = existing?.status === 'checked';

  function handleRecordingChange(jenis: JenisRekaman, blob: Blob | null, durationSec: number | null) {
    setRecordings((prev) => ({
      ...prev,
      [jenis]: blob && durationSec ? { blob, durationSec } : null,
    }));
    if (cacheKey) {
      if (blob && durationSec) saveRecording(cacheKey, jenis, blob, durationSec);
      else deleteRecording(cacheKey, jenis);
    }
  }

  async function onSubmit() {
    if (!allRecorded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const j of JENIS_REKAMAN) {
        const r = recordings[j]!;
        fd.append(`audio_${j}`, r.blob, `${j}.webm`);
        fd.append(`duration_${j}`, String(r.durationSec));
      }
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal submit');
      if (cacheKey) clearRecordings(cacheKey);
      setResultWaUrl(json.wa_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal submit';
      setError(
        msg === 'Failed to fetch'
          ? 'Koneksi gagal. Rekaman masih tersimpan, coba kirim lagi.'
          : msg
      );
    } finally {
      setSubmitting(false);
    }
  }

  // --- already checked: read-only summary ---
  if (checked && existing) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 16 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Setoran pekan ini sudah diperiksa</div>
            <div className="desc">
              {musyrifName} sudah memberi nilai. Lihat di bawah.
            </div>
          </div>
        </div>
        {existing.rekaman.map((r) => (
          <div key={r.jenis} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div className="rec-head" style={{ marginBottom: 6 }}>
              <div className="title">{JENIS_LABEL_FORM[r.jenis] ?? JENIS_REKAMAN_LABEL[r.jenis]}</div>
              {r.nilai && (
                <span className={`badge badge-${r.nilai}`}>
                  <span className="dot" />
                  {capitalize(r.nilai)}
                </span>
              )}
            </div>
            {r.masukan ? (
              <p className="t-body">{r.masukan}</p>
            ) : (
              <p className="t-small" style={{ fontStyle: 'italic' }}>(tidak ada catatan)</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // --- success after submit ---
  if (resultWaUrl) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 16 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Setoran terkirim</div>
            <div className="desc">
              Rekamanmu sudah masuk ke {musyrifName}. Beri tahu beliau di WhatsApp
              agar segera diperiksa.
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="row" style={{ padding: 0 }}>
            <div className="avatar">{musyrifInitials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{musyrifName}</div>
              <div className="t-small">{targetRoleLabel}</div>
            </div>
          </div>
        </div>

        <a
          href={resultWaUrl}
          target="_blank"
          rel="noopener"
          className="btn btn-wa btn-block"
        >
          {Icon.wa(14)} Buka WhatsApp untuk kirim
        </a>
        <button
          type="button"
          onClick={() => {
            if (cacheKey) clearRecordings(cacheKey);
            setRecordings(EMPTY);
            setInitialRecordings({});
            setResultWaUrl(null);
          }}
          className="btn btn-ghost btn-block"
          style={{ marginTop: 12 }}
        >
          Rekam ulang setoran
        </button>
        <p
          className="t-small"
          style={{ textAlign: 'center', marginTop: 16, color: 'var(--muted-2)' }}
        >
          Selama belum diperiksa musyrif, kamu masih boleh rekam ulang.
        </p>
      </div>
    );
  }

  // --- main: form ---
  return (
    <div>
      <p className="t-small" style={{ marginBottom: 14 }}>
        3 rekaman · maks 15 menit per rekaman
      </p>

      <div className="section-row">
        <div className="t-tiny">Rekaman</div>
        <div
          className="t-small"
          style={{ color: allRecorded ? 'var(--hijau-ink)' : undefined }}
        >
          {doneCount} / 3 selesai
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {JENIS_REKAMAN.map((j) => (
          <AudioRecorder
            key={j}
            label={JENIS_LABEL_FORM[j] ?? JENIS_REKAMAN_LABEL[j]}
            disabled={submitting}
            initialRecording={initialRecordings[j] ?? undefined}
            onChange={(blob, durationSec) => handleRecordingChange(j, blob, durationSec)}
          />
        ))}
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginTop: 16 }}>
          <div>
            <div className="title">Gagal mengirim</div>
            <div className="desc">{error}</div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!allRecorded || submitting}
        className={`btn btn-block ${allRecorded && !submitting ? 'btn-primary' : 'btn-soft'}`}
        style={{ marginTop: 20 }}
      >
        {submitting ? 'Mengirim…' : 'Kirim setoran'}
        {allRecorded && !submitting && Icon.arrow(14)}
      </button>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
