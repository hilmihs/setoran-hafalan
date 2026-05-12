'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_DURATION_SEC = 5 * 60;

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'recorded'; blob: Blob; url: string; durationSec: number };

export function AudioRecorder({
  label,
  onChange,
  disabled,
}: {
  label: string;
  onChange: (blob: Blob | null, durationSec: number | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopStream();
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (state.kind === 'recorded') URL.revokeObjectURL(state.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      const startedAt = Date.now();
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(blob);
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        setState({ kind: 'recorded', blob, url, durationSec });
        onChange(blob, durationSec);
        stopStream();
      };
      recorderRef.current = rec;
      rec.start();
      setState({ kind: 'recording', startedAt });
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        const e = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(e);
        if (e >= MAX_DURATION_SEC) stop();
      }, 250);
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak. Aktifkan di pengaturan browser.'
          : 'Tidak bisa mengakses mikrofon.'
      );
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function reset() {
    if (state.kind === 'recorded') URL.revokeObjectURL(state.url);
    setState({ kind: 'idle' });
    setElapsed(0);
    onChange(null, null);
  }

  const isRecording = state.kind === 'recording';
  const isDone = state.kind === 'recorded';

  return (
    <div className="border border-stone-200 rounded-lg p-4 space-y-3 bg-white">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium text-stone-800">{label}</h3>
        {isDone && (
          <span className="text-xs text-green-700">
            ✓ direkam ({formatTime(state.durationSec)})
          </span>
        )}
        {isRecording && (
          <span className="text-xs text-red-600">● merekam {formatTime(elapsed)}</span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {state.kind === 'idle' && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="w-full py-2 px-4 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50"
        >
          Mulai Rekam
        </button>
      )}

      {state.kind === 'recording' && (
        <button
          type="button"
          onClick={stop}
          className="w-full py-2 px-4 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Berhenti
        </button>
      )}

      {state.kind === 'recorded' && (
        <div className="space-y-2">
          <audio src={state.url} controls className="w-full" />
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="w-full py-2 px-4 bg-stone-200 text-stone-800 rounded hover:bg-stone-300 disabled:opacity-50 text-sm"
          >
            Rekam Ulang
          </button>
        </div>
      )}
    </div>
  );
}

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
