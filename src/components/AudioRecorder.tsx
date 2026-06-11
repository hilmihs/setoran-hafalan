'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, Waveform } from './icons';

const MAX_DURATION_SEC = 15 * 60;

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'recorded'; blob: Blob; url: string; durationSec: number };

export function AudioRecorder({
  label,
  onChange,
  disabled,
  initialRecording,
}: {
  label: string;
  onChange: (blob: Blob | null, durationSec: number | null) => void;
  disabled?: boolean;
  initialRecording?: { blob: Blob; durationSec: number };
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialRecording) {
      const url = URL.createObjectURL(initialRecording.blob);
      setState({ kind: 'recorded', blob: initialRecording.blob, url, durationSec: initialRecording.durationSec });
      onChange(initialRecording.blob, initialRecording.durationSec);
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
    } catch (e: unknown) {
      const name = (e as { name?: string } | null)?.name;
      setError(
        name === 'NotAllowedError'
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
    audioRef.current?.pause();
    setPlaying(false);
    setPlayPos(0);
    if (state.kind === 'recorded') URL.revokeObjectURL(state.url);
    setState({ kind: 'idle' });
    setElapsed(0);
    onChange(null, null);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
    } else {
      a.pause();
    }
  }

  return (
    <div className="rec">
      <div className="rec-head">
        <div className="title">{label}</div>
        <Status state={state.kind} elapsed={elapsed} durationSec={state.kind === 'recorded' ? state.durationSec : 0} />
      </div>

      {error && (
        <p style={{ color: 'var(--merah-ink)', fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {state.kind === 'idle' && (
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
      )}

      {state.kind === 'recording' && (
        <div>
          <div className="wave rec">
            <Waveform full progress={1} height={36} />
          </div>
          <div className="rec-action">
            <button
              type="button"
              className="play"
              onClick={stop}
              style={{ background: 'var(--merah)' }}
              aria-label="Berhenti merekam"
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: '#fff',
                  borderRadius: 2,
                  display: 'inline-block',
                }}
              />
            </button>
            <span className="time">{formatTime(elapsed)}</span>
            <button type="button" className="stop" onClick={stop}>
              ● berhenti
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
            onEnded={() => {
              setPlaying(false);
              setPlayPos(0);
            }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setPlayPos(el.currentTime / el.duration);
            }}
            style={{ display: 'none' }}
          />
          <div className={`wave ${playing ? 'done' : 'done'}`}>
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
            <button type="button" className="redo" onClick={reset} disabled={disabled}>
              {Icon.redo()} rekam ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Status({
  state,
  elapsed,
  durationSec,
}: {
  state: 'idle' | 'recording' | 'recorded';
  elapsed: number;
  durationSec: number;
}) {
  if (state === 'recording') {
    return (
      <span className="status rec">
        <span className="dot" />
        <span className="t-mono">{formatTime(elapsed)}</span>
      </span>
    );
  }
  if (state === 'recorded') {
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
