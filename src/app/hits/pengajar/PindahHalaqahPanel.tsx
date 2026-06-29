'use client';

import { useRef, useState, useTransition } from 'react';
import {
  listHalaqahForBatch,
  listPesertaForHalaqah,
  listPengajarOptions,
  ajukanPindahHalaqah,
} from './actions';

type Batch = { id: string; name: string };
type HalaqahOpt = { id: string; name: string; gender: 'ikhwan' | 'akhwat' | null; pengajarNama: string | null; pengajarLinked: boolean };
type PesertaOpt = { id: string; nama: string; status_peserta: string | null; is_ketua: boolean };
type PengajarOpt = { id: string; name: string; whatsapp_number: string | null };

type Step = 'batch' | 'halaqah' | 'peserta' | 'target' | 'done';

export function PindahHalaqahPanel({ batches }: { batches: Batch[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>('batch');
  const [error, setError] = useState<string | null>(null);

  const [batchId, setBatchId] = useState('');
  const [halaqahList, setHalaqahList] = useState<HalaqahOpt[]>([]);
  const [halaqah, setHalaqah] = useState<HalaqahOpt | null>(null);
  const [peserta, setPeserta] = useState<PesertaOpt[]>([]);
  const [pengajarOpts, setPengajarOpts] = useState<PengajarOpt[]>([]);
  const [manual, setManual] = useState(false);
  const [waUrl, setWaUrl] = useState<string | null>(null);

  function open() {
    setStep('batch'); setError(null); setBatchId('');
    setHalaqahList([]); setHalaqah(null); setPeserta([]);
    setPengajarOpts([]); setManual(false); setWaUrl(null);
    dialogRef.current?.showModal();
  }
  function close() { dialogRef.current?.close(); }

  function pickBatch(id: string) {
    setBatchId(id); setError(null);
    if (!id) { setHalaqahList([]); return; }
    start(async () => {
      const res = await listHalaqahForBatch(id);
      setHalaqahList(res.halaqah);
      setStep('halaqah');
    });
  }

  function pickHalaqah(h: HalaqahOpt) {
    setHalaqah(h); setError(null);
    start(async () => {
      const [p, po] = await Promise.all([
        listPesertaForHalaqah(h.id),
        listPengajarOptions(h.gender ?? undefined),
      ]);
      setPeserta(p.peserta);
      setPengajarOpts(po.pengajar);
      setStep('peserta');
    });
  }

  function submit(fd: FormData) {
    if (!halaqah) return;
    fd.set('halaqah_id', halaqah.id);
    fd.set('batch_id', batchId);
    setError(null);
    start(async () => {
      const res = await ajukanPindahHalaqah(undefined, fd);
      if (res?.waUrl) { setWaUrl(res.waUrl); setStep('done'); return; }
      if (res?.ok) { setError(res.error ?? null); setStep('done'); return; }
      setError(res?.error ?? 'Gagal mengajukan.');
    });
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-block" onClick={open} style={{ marginTop: 12 }}>
        Ajukan pemindahan halaqah
      </button>

      <dialog
        ref={dialogRef}
        style={{ border: 'none', borderRadius: 16, padding: 0, maxWidth: 480, width: '90vw', background: 'var(--surface)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflow: 'auto' }}
        onClose={close}
      >
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="t-h2">Pemindahan Halaqah</h2>
            <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>&times;</button>
          </div>

          {error && step !== 'done' && (
            <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>
          )}

          {/* Step 1: batch */}
          {step === 'batch' && (
            <div>
              <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Pilih batch</label>
              <select className="input" style={{ width: '100%' }} value={batchId} onChange={(e) => pickBatch(e.target.value)} disabled={pending}>
                <option value="">— Pilih batch —</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* Step 2: halaqah */}
          {step === 'halaqah' && (
            <div>
              <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>Pilih halaqah yang dipindahkan:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '50vh', overflow: 'auto' }}>
                {halaqahList.length === 0 && <p className="t-small">Tidak ada halaqah di batch ini.</p>}
                {halaqahList.map((h) => (
                  <button key={h.id} type="button" className="card-flat" onClick={() => pickHalaqah(h)} disabled={pending}
                    style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600 }}>{h.name}</div>
                    <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                      Pengajar: {h.pengajarNama ?? '—'}{!h.pengajarLinked && h.pengajarNama ? ' (belum terhubung)' : ''}
                    </div>
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setStep('batch')}>← Ganti batch</button>
            </div>
          )}

          {/* Step 3: peserta preview */}
          {step === 'peserta' && halaqah && (
            <div>
              <p className="t-small" style={{ marginBottom: 4 }}><strong>{halaqah.name}</strong></p>
              <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>Peserta ({peserta.length}):</p>
              <div style={{ maxHeight: '40vh', overflow: 'auto', marginBottom: 12 }}>
                {peserta.length === 0 ? (
                  <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada peserta aktif.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {peserta.map((p) => (
                      <li key={p.id} className="t-small">
                        {p.nama}{p.is_ketua ? ' (Ketua)' : ''}
                        {p.status_peserta && p.status_peserta !== 'Aktif' && <span style={{ color: 'var(--muted-2)' }}> · {p.status_peserta}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setStep('halaqah')}>← Kembali</button>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep('target')}>Lanjut →</button>
              </div>
            </div>
          )}

          {/* Step 4: target + confirm */}
          {step === 'target' && halaqah && (
            <form action={submit}>
              <p className="t-small" style={{ marginBottom: 8 }}>Pindahkan <strong>{halaqah.name}</strong> ke:</p>

              {!manual ? (
                <select name="target_pengajar_id" required className="input" style={{ width: '100%' }} defaultValue="">
                  <option value="" disabled>— Pilih pengajar tujuan —</option>
                  {pengajarOpts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.whatsapp_number ? '' : ' (tanpa WA)'}</option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="text" name="target_name" required placeholder="Nama pengajar tujuan" className="input" style={{ width: '100%' }} />
                  <input type="tel" name="target_wa" required placeholder="08xxxxxxxxxx" className="input" style={{ width: '100%' }} />
                </div>
              )}

              <button type="button" onClick={() => setManual((m) => !m)}
                style={{ background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
                {manual ? '← Pilih dari daftar pengajar' : 'Tidak ada di daftar? Tulis manual'}
              </button>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setStep('peserta')} disabled={pending}>← Kembali</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
                  {pending ? 'Mengirim…' : 'Ajukan & kirim WA'}
                </button>
              </div>
            </form>
          )}

          {/* Step 5: done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <p className="t-body" style={{ fontWeight: 600, color: 'var(--hijau-ink)', marginBottom: 8 }}>
                Pengajuan tersimpan.
              </p>
              {error && <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>{error}</p>}
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block" style={{ marginBottom: 8 }}>
                  Kirim link persetujuan via WhatsApp
                </a>
              ) : (
                <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                  Nomor WA pengajar tujuan belum ada — bagikan link persetujuan secara manual.
                </p>
              )}
              <button type="button" className="btn-ghost btn-block" onClick={close}>Tutup</button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
