'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, Waveform } from './icons';
import { LiveWaveform } from './LiveWaveform';

const MAX_DURATION_SEC = 15 * 60;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number; base: number }
  | { kind: 'paused' }
  | { kind: 'recorded'; blob: Blob | null; url: string; durationSec: number };

export function AudioRecorder({
  label,
  onChange,
  disabled,
  submitted,
  initialRecording,
  initialAudioUrl,
  initialDurationSec,
}: {
  label: string;
  onChange: (blob: Blob | null, durationSec: number | null) => void;
  disabled?: boolean;
  submitted?: boolean;
  initialRecording?: { blob: Blob; durationSec: number };
  // Rekaman yang sudah tersimpan di server — dipulihkan untuk diputar.
  // Tidak memicu onChange (sudah ada di server, jangan auto-submit ulang).
  initialAudioUrl?: string;
  initialDurationSec?: number;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [mode, setMode] = useState<'rec' | 'upload'>('rec');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elapsedRef = useRef(0);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialRecording) {
      const url = URL.createObjectURL(initialRecording.blob);
      setState({ kind: 'recorded', blob: initialRecording.blob, url, durationSec: initialRecording.durationSec });
      onChange(initialRecording.blob, initialRecording.durationSec);
    } else if (initialAudioUrl) {
      // Sudah tersimpan di server — tampilkan untuk diputar, JANGAN panggil onChange.
      setState({ kind: 'recorded', blob: null, url: initialAudioUrl, durationSec: initialDurationSec ?? 0 });
    }
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

  function startTick(startedAt: number, base: number) {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const total = base + Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(total);
      elapsedRef.current = total;
      if (total >= MAX_DURATION_SEC) stop();
    }, 250);
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
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(blob);
        const durationSec = Math.max(1, elapsedRef.current);
        setState({ kind: 'recorded', blob, url, durationSec });
        onChange(blob, durationSec);
        stopStream();
      };
      recorderRef.current = rec;
      rec.start();
      const startedAt = Date.now();
      elapsedRef.current = 0;
      setElapsed(0);
      setState({ kind: 'recording', startedAt, base: 0 });
      startTick(startedAt, 0);
    } catch (e: unknown) {
      const name = (e as { name?: string } | null)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak. Aktifkan di pengaturan browser.'
          : 'Tidak bisa mengakses mikrofon.'
      );
    }
  }

  function pause() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.pause();
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setState({ kind: 'paused' });
  }

  function resume() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    rec.resume();
    const startedAt = Date.now();
    const base = elapsedRef.current;
    setState({ kind: 'recording', startedAt, base });
    startTick(startedAt, base);
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      if (recorderRef.current.state === 'paused') recorderRef.current.resume();
      recorderRef.current.stop();
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function reset() {
    audioRef.current?.pause();
    setPlaying(false);
    setPlayPos(0);
    if (state.kind === 'recorded') URL.revokeObjectURL(state.url);
    setState({ kind: 'idle' });
    setElapsed(0);
    elapsedRef.current = 0;
    onChange(null, null);
    if (uploadRef.current) uploadRef.current.value = '';
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Hanya file audio yang didukung (mp3, m4a, ogg, webm).');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Ukuran file maks 25 MB.');
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    const duration = await new Promise<number>((resolve) => {
      audio.onloadedmetadata = () => resolve(audio.duration || 0);
      audio.onerror = () => resolve(0);
    });
    const durationSec = Math.max(1, Math.round(duration));
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    setState({ kind: 'recorded', blob, url, durationSec });
    onChange(blob, durationSec);
  }

  return (
    <div className="rec">
      <div className="rec-head">
        <div className="title">{label}</div>
        <Status state={state.kind} elapsed={elapsed} durationSec={state.kind === 'recorded' ? state.durationSec : 0} submitted={submitted} />
      </div>

      {error && (
        <p style={{ color: 'var(--merah-ink)', fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {state.kind === 'idle' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setMode('rec')}
              className={mode === 'rec' ? 'btn btn-soft btn-xs active' : 'btn btn-ghost btn-xs'}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {Icon.mic(12)} Rekam
            </button>
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={mode === 'upload' ? 'btn btn-soft btn-xs active' : 'btn btn-ghost btn-xs'}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              ↑ Upload
            </button>
          </div>
          {mode === 'rec' ? (
            <button
              type="button"
              onClick={start}
              disabled={disabled}
              className="rec-start"
            >
              <span className="ic">{Icon.mic(16)}</span>
              <span className="txt">Mulai rekam</span>
              <span className="hint">maks 15 min</span>
            </button>
          ) : (
            <div>
              <input
                ref={uploadRef}
                type="file"
                accept="audio/*"
                disabled={disabled}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id={`upload-${label.replace(/\s+/g, '-')}`}
              />
              <label
                htmlFor={`upload-${label.replace(/\s+/g, '-')}`}
                className="rec-start"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span className="ic">↑</span>
                <span className="txt">Pilih file audio</span>
                <span className="hint">maks 25 MB · mp3, m4a, ogg</span>
              </label>
            </div>
          )}
        </div>
      )}

      {(state.kind === 'recording' || state.kind === 'paused') && (
        <div>
          <LiveWaveform stream={streamRef.current} paused={state.kind === 'paused'} height={60} />
          <div className="rec-action">
            <button
              type="button"
              className="play"
              onClick={stop}
              style={{ background: 'var(--merah)' }}
              aria-label="Selesai merekam"
            >
              <span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2, display: 'inline-block' }} />
            </button>
            <span className="time">{formatTime(elapsed)}</span>
            {state.kind === 'recording' ? (
              <button type="button" className="stop" onClick={pause} aria-label="Jeda">
                ⏸ jeda
              </button>
            ) : (
              <button type="button" className="stop" onClick={resume} aria-label="Lanjut rekam">
                ▶ lanjut
              </button>
            )}
            <button type="button" className="stop" onClick={stop} style={{ marginLeft: 4 }}>
              ■ selesai
            </button>
          </div>
        </div>
      )}

      {state.kind === 'recorded' && (
        <div>
          <audio
            ref={audioRef}
            src={state.url}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setPlayPos(0); }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setPlayPos(el.currentTime / el.duration);
            }}
            style={{ display: 'none' }}
          />
          <div className="wave done">
            <Waveform progress={playPos || 1} height={36} />
          </div>
          <div className="rec-action">
            <button
              type="button"
              className="play"
              onClick={togglePlay}
              aria-label={playing ? 'Jeda' : 'Putar'}
            >
              {playing ? (
                <svg width={12} height={12} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                  <rect x="3" y="2.5" width="2.2" height="7" rx="0.6" />
                  <rect x="6.8" y="2.5" width="2.2" height="7" rx="0.6" />
                </svg>
              ) : (
                Icon.play(12)
              )}
            </button>
            <span className="time">
              {formatTime(Math.round(playPos * state.durationSec))} / {formatTime(state.durationSec)}
            </span>
            <a
              href={state.url}
              download={downloadName(label, state.blob?.type ?? 'audio/webm')}
              className="redo"
              style={{ textDecoration: 'none' }}
              title="Unduh rekaman ke perangkat"
            >
              ↓ unduh
            </a>
            {!submitted && (
              <button type="button" className="redo" onClick={reset} disabled={disabled}>
                {Icon.redo()} rekam ulang
              </button>
            )}
          </div>
          {!submitted && (
            <p
              style={{
                fontSize: 11,
                color: 'var(--hijau-ink)',
                margin: '6px 0 0',
              }}
            >
              ✓ Rekaman tersimpan — otomatis terkirim ke server, aman walau ganti perangkat.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Status({
  state,
  elapsed,
  durationSec,
  submitted,
}: {
  state: 'idle' | 'recording' | 'paused' | 'recorded';
  elapsed: number;
  durationSec: number;
  submitted?: boolean;
}) {
  if (state === 'recording') {
    return (
      <span className="status rec">
        <span className="dot" />
        <span className="t-mono">{formatTime(elapsed)}</span>
      </span>
    );
  }
  if (state === 'paused') {
    return (
      <span className="status" style={{ color: 'var(--kuning-ink)' }}>
        <span className="dot" style={{ background: 'var(--kuning)' }} />
        <span className="t-mono">{formatTime(elapsed)} (jeda)</span>
      </span>
    );
  }
  if (state === 'recorded') {
    if (submitted) {
      return (
        <span className="status done">
          <span style={{ fontSize: 11 }}>✓ terkirim</span>
        </span>
      );
    }
    return (
      <span className="status done">
        <span className="dot" />
        <span className="t-mono">{formatTime(durationSec)}</span>
      </span>
    );
  }
  return (
    <span className="status">
      <span className="dot" /> belum direkam
    </span>
  );
}

function downloadName(label: string, mime: string): string {
  const slug = label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let ext = 'webm';
  if (mime.includes('mp4')) ext = 'm4a';
  else if (mime.includes('ogg')) ext = 'ogg';
  else if (mime.includes('mpeg')) ext = 'mp3';
  return `rekaman-${slug || 'audio'}.${ext}`;
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
