'use client';

import { useEffect, useState } from 'react';
import { AudioRecorder } from './AudioRecorder';
import { Icon, Initials } from './icons';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  JENIS_REKAMAN_MAX_DURASI_SEC,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';
import {
  saveRecording,
  deleteRecording,
  loadRecordings,
  clearRecordings,
} from '@/lib/recording-cache';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { ADMIN_WA } from '@/lib/constants';

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

type SubmitState = 'idle' | 'submitting' | 'done';

export function PesertaSetoranForm({
  musyrifName,
  musyrifInitials,
  existing,
  endpoint = '/api/setoran/submit',
  singleSubmitEndpoint,
  targetRoleLabel = 'Musyrif kelas Anda',
  cacheKey,
  periodWeekStart,
  submittedJenis,
  restored,
  pesertaName,
  pesertaId,
  kelasName,
}: {
  musyrifName: string;
  musyrifInitials: string;
  existing: ExistingSetoran | null;
  endpoint?: string;
  singleSubmitEndpoint?: string;
  targetRoleLabel?: string;
  cacheKey?: string;
  periodWeekStart?: string;
  submittedJenis?: JenisRekaman[];
  // Identitas peserta → dipakai isi laporan gagal upload ke support (WA).
  pesertaName?: string;
  pesertaId?: string;
  kelasName?: string;
  // Rekaman yang sudah tersimpan di server → dipulihkan untuk diputar.
  restored?: Partial<Record<JenisRekaman, { audioUrl: string; durationSec: number }>>;
}) {
  const [recordings, setRecordings] = useState<Recordings>(EMPTY);
  const [initialRecordings, setInitialRecordings] = useState<Partial<Recordings>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultWaUrl, setResultWaUrl] = useState<string | null>(
    existing?.status === 'submitted' ? existing.musyrifWaUrl : null
  );

  // Per-rekaman submit (2in1 mode). Jenis yang sudah disetor di periode ini
  // (backfill) langsung ditandai 'done' agar tak dikirim ulang.
  const [perJenisState, setPerJenisState] = useState<Record<JenisRekaman, SubmitState>>({
    tuhfatul_athfal: submittedJenis?.includes('tuhfatul_athfal') ? 'done' : 'idle',
    jazariyyah: submittedJenis?.includes('jazariyyah') ? 'done' : 'idle',
    syawahid: submittedJenis?.includes('syawahid') ? 'done' : 'idle',
  });
  const [perJenisError, setPerJenisError] = useState<Partial<Record<JenisRekaman, string>>>({});
  const [singleWaUrl, setSingleWaUrl] = useState<string | null>(null);
  // WA link "lapor ke support" — terisi saat upload gagal, berisi diagnostik.
  const [perJenisReportUrl, setPerJenisReportUrl] = useState<Partial<Record<JenisRekaman, string>>>({});
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  // Bangun teks laporan diagnostik + WA URL ke ADMIN_WA (technical support).
  function buildReportUrl(ctx: {
    jenisLabel: string;
    sizeBytes?: number;
    mime?: string;
    durationSec?: number;
    httpStatus?: number | null;
    errorMsg: string;
  }): string {
    const mb =
      ctx.sizeBytes != null ? `${(ctx.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '-';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '-';
    const now =
      typeof Date !== 'undefined' ? new Date().toLocaleString('id-ID') : '-';
    const msg = [
      '*LAPORAN GAGAL UPLOAD SETORAN*',
      `Peserta: ${pesertaName ?? '-'}${pesertaId ? ` (${pesertaId})` : ''}`,
      `Kelas: ${kelasName ?? '-'} → ${musyrifName}`,
      `Rekaman: ${ctx.jenisLabel}`,
      `Periode: ${periodWeekStart ?? cacheKey ?? '-'}`,
      `Durasi: ${ctx.durationSec ?? '-'} detik`,
      `Ukuran: ${mb}`,
      `Format: ${ctx.mime || '-'}`,
      `Status: ${
        ctx.httpStatus == null ? 'TIDAK ADA RESPON (kemungkinan jaringan)' : ctx.httpStatus
      }`,
      `Error: ${ctx.errorMsg}`,
      `Waktu: ${now}`,
      `Device: ${ua}`,
      '',
      'Mohon dibantu ustadz/ustadzah. Jazaakumullahu khairan.',
    ].join('\n');
    return buildWaMeUrl(ADMIN_WA, msg);
  }

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
    // Rekam ulang (blob null) → reset status agar bisa dikirim lagi.
    if (!blob) {
      setPerJenisState((p) => (p[jenis] === 'done' ? { ...p, [jenis]: 'idle' } : p));
    }
    // Auto-save ke server begitu rekaman selesai (single mode). Lewati bila jenis
    // ini sudah tersimpan (restore dari server) atau sedang dikirim.
    if (
      singleSubmitEndpoint &&
      blob &&
      durationSec &&
      perJenisState[jenis] !== 'done' &&
      perJenisState[jenis] !== 'submitting'
    ) {
      void submitSingle(jenis, { blob, durationSec });
    }
  }

  async function submitSingle(
    jenis: JenisRekaman,
    recOverride?: { blob: Blob; durationSec: number }
  ) {
    if (!singleSubmitEndpoint) return;
    const rec = recOverride ?? recordings[jenis];
    if (!rec) return;
    setPerJenisState((p) => ({ ...p, [jenis]: 'submitting' }));
    setPerJenisError((p) => ({ ...p, [jenis]: undefined }));
    setPerJenisReportUrl((p) => ({ ...p, [jenis]: undefined }));
    let httpStatus: number | null = null;
    try {
      const fd = new FormData();
      fd.append('jenis', jenis);
      fd.append('audio_file', rec.blob, `${jenis}.webm`);
      fd.append('duration_sec', String(rec.durationSec));
      if (periodWeekStart) fd.append('week_start', periodWeekStart);
      const res = await fetch(singleSubmitEndpoint, { method: 'POST', body: fd });
      httpStatus = res.status;
      let json: { error?: string; wa_url?: string } = {};
      try {
        json = await res.json();
      } catch {
        /* body bukan JSON (mis. 413 dari nginx) → biarkan json kosong */
      }
      if (!res.ok) throw new Error(json.error ?? `Gagal submit (HTTP ${res.status})`);
      if (cacheKey) deleteRecording(cacheKey, jenis);
      setPerJenisState((p) => ({ ...p, [jenis]: 'done' }));
      if (json.wa_url && !singleWaUrl) setSingleWaUrl(json.wa_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal submit';
      const reportWa = buildReportUrl({
        jenisLabel: JENIS_LABEL_FORM[jenis],
        sizeBytes: rec.blob.size,
        mime: rec.blob.type,
        durationSec: rec.durationSec,
        httpStatus,
        errorMsg: msg,
      });
      setPerJenisError((p) => ({ ...p, [jenis]: msg }));
      setPerJenisReportUrl((p) => ({ ...p, [jenis]: reportWa }));
      setPerJenisState((p) => ({ ...p, [jenis]: 'idle' }));
    }
  }

  async function onSubmit() {
    if (!allRecorded || submitting) return;
    setSubmitting(true);
    setError(null);
    setReportUrl(null);
    let httpStatus: number | null = null;
    let totalBytes = 0;
    let firstMime = '';
    for (const j of JENIS_REKAMAN) {
      const r = recordings[j];
      if (r) {
        totalBytes += r.blob.size;
        if (!firstMime) firstMime = r.blob.type;
      }
    }
    try {
      const fd = new FormData();
      for (const j of JENIS_REKAMAN) {
        const r = recordings[j]!;
        fd.append(`audio_${j}`, r.blob, `${j}.webm`);
        fd.append(`duration_${j}`, String(r.durationSec));
      }
      if (periodWeekStart) fd.append('week_start', periodWeekStart);
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      httpStatus = res.status;
      let json: { error?: string; wa_url?: string } = {};
      try {
        json = await res.json();
      } catch {
        /* body bukan JSON (mis. 413 dari nginx) */
      }
      if (!res.ok) throw new Error(json.error ?? `Gagal submit (HTTP ${res.status})`);
      if (cacheKey) clearRecordings(cacheKey);
      setResultWaUrl(json.wa_url ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal submit';
      setError(
        msg === 'Failed to fetch'
          ? 'Koneksi gagal. Rekaman masih tersimpan, coba kirim lagi.'
          : msg
      );
      setReportUrl(
        buildReportUrl({
          jenisLabel: 'Semua rekaman (3 sekaligus)',
          sizeBytes: totalBytes,
          mime: firstMime,
          httpStatus,
          errorMsg: msg,
        })
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

  // --- success after bulk submit ---
  if (resultWaUrl && !singleSubmitEndpoint) {
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

  const hasSingleMode = !!singleSubmitEndpoint;
  const anySubmitted = hasSingleMode && Object.values(perJenisState).some((s) => s === 'done');
  const allSingleSubmitted = hasSingleMode && JENIS_REKAMAN.every((j) => perJenisState[j] === 'done');

  // --- main: form ---
  return (
    <div>
      <p className="t-small" style={{ marginBottom: 14 }}>
        {hasSingleMode ? 'Rekam dan kirim satu per satu, atau langsung 3 sekaligus.' : '3 rekaman · maks 30 menit (Al-Jazariyyah 45) per rekaman'}
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

      {/* WA banner after first single submit */}
      {singleWaUrl && (
        <div className="banner banner-success" style={{ marginBottom: 12 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="title">Rekaman terkirim ke {musyrifName}</div>
            <div className="desc">Rekaman lain bisa dikirim sendiri-sendiri.</div>
          </div>
          <a href={singleWaUrl} target="_blank" rel="noopener" className="btn btn-wa btn-xs" style={{ whiteSpace: 'nowrap' }}>
            {Icon.wa(12)} WA
          </a>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {JENIS_REKAMAN.map((j) => {
          const isSubmitted = perJenisState[j] === 'done';
          const isSubmitting = perJenisState[j] === 'submitting';
          const rec = recordings[j];
          const perErr = perJenisError[j];
          return (
            <div key={j}>
              <AudioRecorder
                label={JENIS_LABEL_FORM[j] ?? JENIS_REKAMAN_LABEL[j]}
                maxDurationSec={JENIS_REKAMAN_MAX_DURASI_SEC[j]}
                disabled={submitting || isSubmitting || isSubmitted}
                submitted={isSubmitted}
                initialRecording={initialRecordings[j] ?? undefined}
                initialAudioUrl={restored?.[j]?.audioUrl}
                initialDurationSec={restored?.[j]?.durationSec}
                onChange={(blob, durationSec) => handleRecordingChange(j, blob, durationSec)}
              />
              {hasSingleMode && rec && !isSubmitted && (
                <div style={{ marginTop: 6 }}>
                  {perErr && (
                    <p style={{ color: 'var(--merah-ink)', fontSize: 11, marginBottom: 4 }}>{perErr}</p>
                  )}
                  {perJenisReportUrl[j] && (
                    <a
                      href={perJenisReportUrl[j]}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-wa btn-xs"
                      style={{ width: '100%', marginBottom: 6, justifyContent: 'center' }}
                    >
                      {Icon.wa(12)} Laporkan gagal ke Technical Support
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => submitSingle(j)}
                    disabled={isSubmitting || submitting}
                    className={`btn btn-xs ${isSubmitting ? 'btn-soft' : 'btn-primary'}`}
                    style={{ width: '100%' }}
                  >
                    {isSubmitting ? 'Mengirim…' : `Kirim rekaman ${JENIS_LABEL_FORM[j]}`}
                  </button>
                </div>
              )}
              {hasSingleMode && isSubmitted && (
                <p style={{ fontSize: 11, color: 'var(--hijau-ink)', marginTop: 4 }}>
                  ✓ Rekaman {JENIS_LABEL_FORM[j]} terkirim
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="title">Gagal mengirim</div>
            <div className="desc">{error}</div>
            {reportUrl && (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener"
                className="btn btn-wa btn-xs"
                style={{ marginTop: 8, justifyContent: 'center' }}
              >
                {Icon.wa(12)} Laporkan gagal ke Technical Support
              </a>
            )}
          </div>
        </div>
      )}

      {!allSingleSubmitted && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!allRecorded || submitting}
          className={`btn btn-block ${allRecorded && !submitting ? 'btn-primary' : 'btn-soft'}`}
          style={{ marginTop: 20 }}
        >
          {submitting ? 'Mengirim…' : anySubmitted ? 'Kirim sisa rekaman' : 'Kirim setoran'}
          {allRecorded && !submitting && Icon.arrow(14)}
        </button>
      )}

      {allSingleSubmitted && (
        <div className="banner banner-success" style={{ marginTop: 16 }}>
          <div>
            <div className="title">Semua rekaman terkirim</div>
            <div className="desc">Musyrif akan segera memeriksa. Selama belum diperiksa, kamu masih bisa rekam ulang.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
