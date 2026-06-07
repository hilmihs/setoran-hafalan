'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { submitCheckin, submitAlasan } from './actions';
import { KetuaKelasStep } from './KetuaKelasStep';
import type { Gender } from '@/types/db';
import type { ProgramToday } from '@/lib/attendance';

export interface KetuaKelasInfo {
  kelasHitsId: string;
  kelasName: string;
  hasKetuaThisBatch: boolean;
  currentKetuaName: string | null;
}

interface Props {
  programs: ProgramToday[];
  checkedKeys: string[];
  pengajarId: string;
  pengajarGender: Gender;
  autoPopup?: boolean;
  kelasList?: KetuaKelasInfo[];
  pekan?: number | null;
}

export function CheckinForm({ programs, checkedKeys, autoPopup, kelasList, pekan }: Props) {
  const [completed, setCompleted] = useState<string[]>(checkedKeys);
  const [showAlasan, setShowAlasan] = useState(false);
  const [lastWaUrl, setLastWaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [ketuaStepDone, setKetuaStepDone] = useState<Set<string>>(new Set());
  const [ketuaWaUrl, setKetuaWaUrl] = useState<string | null>(null);

  const remaining = programs.filter(
    (p) => !completed.includes(`${p.type}:${p.id}:${p.tanggal}`)
  );

  const current = remaining[0];

  const needsKetuaStep = (() => {
    if (!current || !pekan || pekan > 2) return false;
    if (current.type !== 'kelas_maahir') return false;
    const info = kelasList?.find((k) => k.kelasHitsId === current.id);
    if (!info) return false;
    if (info.hasKetuaThisBatch) return false;
    if (ketuaStepDone.has(current.id)) return false;
    return true;
  })();

  useEffect(() => {
    if (autoPopup && remaining.length > 0) {
      setModalOpen(true);
    }
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (modalOpen && !d.open) d.showModal();
    if (!modalOpen && d.open) d.close();
  }, [modalOpen]);

  useEffect(() => {
    if (remaining.length === 0 && modalOpen) {
      setTimeout(() => setModalOpen(false), 1500);
    }
  }, [remaining.length, modalOpen]);

  function handleCheckin(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitCheckin(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok && current) {
        const key = `${current.type}:${current.id}:${current.tanggal}`;
        setCompleted((prev) => [...prev, key]);
        const status = fd.get('status') as string;
        setShowAlasan(status === 'izin' || status === 'sakit');
      }
    });
  }

  function handleAlasan(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitAlasan(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok) {
        setShowAlasan(false);
        if (result.waUrl) setLastWaUrl(result.waUrl);
      }
    });
  }

  function handleKetuaComplete(waUrl?: string) {
    if (current) {
      setKetuaStepDone((prev) => new Set(prev).add(current.id));
    }
    if (waUrl) setKetuaWaUrl(waUrl);
  }

  function handleKetuaSkip() {
    if (current) {
      setKetuaStepDone((prev) => new Set(prev).add(current.id));
    }
  }

  const formContent = (() => {
    if (remaining.length === 0) {
      return (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p className="t-body" style={{ fontWeight: 600, color: 'var(--success, #4caf50)' }}>
            Semua kehadiran sudah terisi!
          </p>
          {lastWaUrl && (
            <a
              href={lastWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ marginTop: 12, display: 'inline-block' }}
            >
              Kirim notifikasi ke Ketua Kelompok
            </a>
          )}
        </div>
      );
    }

    if (needsKetuaStep && current) {
      const info = kelasList?.find((k) => k.kelasHitsId === current.id);
      return (
        <>
          <KetuaKelasStep
            kelasHitsId={current.id}
            kelasName={info?.kelasName ?? current.name}
            pekan={pekan!}
            currentKetuaName={info?.currentKetuaName ?? null}
            onComplete={handleKetuaComplete}
            onSkip={handleKetuaSkip}
          />
          {ketuaWaUrl && (
            <div style={{ padding: '0 20px 16px', textAlign: 'center' }}>
              <a
                href={ketuaWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                Kirim notifikasi ke Ketua Kelas baru
              </a>
            </div>
          )}
        </>
      );
    }

    if (showAlasan && current) {
      return (
        <div style={{ padding: '16px 20px' }}>
          <h3 className="t-h2" style={{ marginBottom: 4 }}>Ajukan Alasan</h3>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
            {current.name} — {current.tanggal}
          </p>

          <form action={handleAlasan}>
            <input type="hidden" name="tanggal" value={current.tanggal} />
            <input type="hidden" name="jenis" value="alpa" />
            {current.type === 'program' && (
              <input type="hidden" name="program_id" value={current.id} />
            )}
            {current.type === 'kelas_maahir' && (
              <input type="hidden" name="kelas_hits_id" value={current.id} />
            )}

            <textarea
              name="alasan"
              required
              placeholder="Tulis alasan Anda..."
              className="textarea"
              style={{ marginBottom: 12 }}
            />

            {error && (
              <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn" disabled={pending} style={{ flex: 1 }}>
                {pending ? 'Mengirim...' : 'Kirim Alasan'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAlasan(false)}
              >
                Lewati
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div style={{ padding: '16px 20px' }}>
        {ketuaWaUrl && (
          <div
            style={{
              background: 'var(--hijau-tint)',
              border: '1px solid var(--hijau-line)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            <p className="t-small" style={{ color: 'var(--hijau-ink)', fontWeight: 600, marginBottom: 4 }}>
              Ketua kelas berhasil disimpan!
            </p>
            <a
              href={ketuaWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ fontSize: 13 }}
              onClick={() => setKetuaWaUrl(null)}
            >
              Kirim notifikasi ke Ketua Kelas
            </a>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>
            {remaining.length > 1 ? `${remaining.length} program tersisa` : 'Program terakhir'}
          </p>
          <h3 className="t-h2" style={{ marginBottom: 4 }}>{current.name}</h3>
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>
            {current.tanggal} &bull; {current.waktu_mulai} – {current.waktu_selesai}
          </p>
        </div>

        <form action={handleCheckin}>
          <input type="hidden" name="tanggal" value={current.tanggal} />
          {current.type === 'program' && (
            <input type="hidden" name="program_id" value={current.id} />
          )}
          {current.type === 'kelas_maahir' && (
            <input type="hidden" name="kelas_hits_id" value={current.id} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {(['hadir', 'izin', 'sakit'] as const).map((s) => (
              <label
                key={s}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  border: '1px solid var(--line-2)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <input type="radio" name="status" value={s} required />
                <span style={{ fontWeight: 500 }}>
                  {s === 'hadir' ? 'Hadir' : s === 'izin' ? 'Izin (Tidak Hadir)' : 'Sakit'}
                </span>
              </label>
            ))}
          </div>

          {error && (
            <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn" disabled={pending} style={{ width: '100%' }}>
            {pending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </form>

        {lastWaUrl && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <a
              href={lastWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              Kirim notifikasi ke Ketua Kelompok
            </a>
          </div>
        )}
      </div>
    );
  })();

  return (
    <>
      {/* Inline card */}
      <div className="card-flat">{formContent}</div>

      {/* Auto-popup modal */}
      {autoPopup && (
        <dialog
          ref={dialogRef}
          style={{
            border: 'none',
            borderRadius: 16,
            padding: 0,
            maxWidth: 440,
            width: '90vw',
            background: 'var(--surface)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}
          onClose={() => setModalOpen(false)}
        >
          <div style={{ padding: '16px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="t-h2">
              {needsKetuaStep ? 'Ketua Kelas' : 'Isi Kehadiran'}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, color: 'var(--muted)', padding: '4px 8px',
              }}
            >
              &times;
            </button>
          </div>
          {formContent}
        </dialog>
      )}
    </>
  );
}
