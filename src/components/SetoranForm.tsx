'use client';

import { useMemo, useState } from 'react';
import { AudioRecorder } from './AudioRecorder';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  type Gender,
  type JenisRekaman,
} from '@/types/db';

export interface KelasLite {
  id: string;
  name: string;
}
export interface PesertaLite {
  id: string;
  name: string;
  kelas_id: string;
}

type Recordings = Record<JenisRekaman, { blob: Blob; durationSec: number } | null>;

const EMPTY: Recordings = {
  tuhfatul_athfal: null,
  jazariyyah: null,
  syawahid: null,
};

export function SetoranForm({
  gender,
  kelasList,
  pesertaList,
}: {
  gender: Gender;
  kelasList: KelasLite[];
  pesertaList: PesertaLite[];
}) {
  const [kelasId, setKelasId] = useState('');
  const [pesertaId, setPesertaId] = useState('');
  const [recordings, setRecordings] = useState<Recordings>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    musyrifName: string;
    waUrl: string;
  } | null>(null);

  const filteredPeserta = useMemo(
    () => pesertaList.filter((p) => p.kelas_id === kelasId),
    [pesertaList, kelasId]
  );

  const allRecorded =
    !!recordings.tuhfatul_athfal &&
    !!recordings.jazariyyah &&
    !!recordings.syawahid;

  const canSubmit = !!kelasId && !!pesertaId && allRecorded && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('peserta_id', pesertaId);
      fd.append('gender', gender);
      for (const j of JENIS_REKAMAN) {
        const r = recordings[j]!;
        fd.append(`audio_${j}`, r.blob, `${j}.webm`);
        fd.append(`duration_${j}`, String(r.durationSec));
      }
      const res = await fetch('/api/setoran/submit', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal submit');
      setResult({ musyrifName: json.musyrif_name, waUrl: json.wa_url });
    } catch (e: any) {
      setError(e.message ?? 'Gagal submit');
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    setRecordings(EMPTY);
    setResult(null);
    setError(null);
    setPesertaId('');
    setKelasId('');
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <h2 className="font-semibold text-green-900">Setoran berhasil dikirim</h2>
          <p className="text-sm text-green-800 mt-1">
            Tap tombol di bawah untuk membuka WhatsApp dan kirim pemberitahuan ke
            Ustadz {result.musyrifName}. (Anda tetap harus tap tombol "Kirim" di
            WhatsApp.)
          </p>
        </div>
        <a
          href={result.waUrl}
          target="_blank"
          rel="noopener"
          className="block text-center py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          Buka WhatsApp untuk kirim ke Ustadz
        </a>
        <button
          type="button"
          onClick={resetAll}
          className="block w-full text-center py-2 px-4 text-sm text-stone-600 hover:text-stone-800"
        >
          Setor lagi (peserta lain)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Kelas</span>
          <select
            value={kelasId}
            onChange={(e) => {
              setKelasId(e.target.value);
              setPesertaId('');
            }}
            disabled={submitting}
            className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 bg-white"
          >
            <option value="">— pilih kelas —</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                Kelas {k.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-stone-700">Nama</span>
          <select
            value={pesertaId}
            onChange={(e) => setPesertaId(e.target.value)}
            disabled={!kelasId || submitting}
            className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 bg-white disabled:bg-stone-100"
          >
            <option value="">— pilih nama —</option>
            {filteredPeserta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`space-y-3 ${!pesertaId ? 'opacity-50 pointer-events-none' : ''}`}>
        {JENIS_REKAMAN.map((j) => (
          <AudioRecorder
            key={j}
            label={JENIS_REKAMAN_LABEL[j]}
            disabled={submitting}
            onChange={(blob, durationSec) => {
              setRecordings((prev) => ({
                ...prev,
                [j]: blob && durationSec ? { blob, durationSec } : null,
              }));
            }}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-3 px-4 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {submitting ? 'Mengirim…' : 'Submit Setoran'}
      </button>
    </div>
  );
}
