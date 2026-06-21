'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { submitKeteranganHarian } from './actions';
import { HITS_KONDISI_LABEL, HITS_STATUS_LATIHAN_LABEL } from '@/types/db';
import type { HitsKondisi, HitsStatusLatihan, HitsLevel } from '@/types/db';

export type SlotKeterangan = {
  kondisi: HitsKondisi;
  terlambat: boolean;
  latihan_diberikan: boolean | null;
  status_latihan: HitsStatusLatihan | null;
  semua_selesai: boolean | null;
  catatan: string | null;
  editable: boolean;
};

export type PertemuanSlot = {
  pertemuanNo: number;
  level: HitsLevel;
  levelLabel: string;
  tanggal: string;
  hari: string;
  isToday: boolean;
  keterangan: SlotKeterangan | null;
};

const slotKey = (s: { level: HitsLevel; pertemuanNo: number }) => `${s.level}-${s.pertemuanNo}`;

interface Props {
  halaqahName: string;
  pengajarName: string;
  slots: PertemuanSlot[];
  todayUnfilled: boolean;
}

export function HitsKetuaForm({ halaqahName, pengajarName, slots: initialSlots, todayUnfilled }: Props) {
  const [slots, setSlots] = useState(initialSlots);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editing = slots.find((s) => slotKey(s) === editingKey) ?? null;

  const [kondisi, setKondisi] = useState<HitsKondisi>('KBBS');
  const [latihanDiberikan, setLatihanDiberikan] = useState(true);
  const [statusLatihan, setStatusLatihan] = useState<HitsStatusLatihan>('SML');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    const today = slots.find((s) => s.isToday);
    if (todayUnfilled && today) {
      loadInto(today);
      setModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (modalOpen && !d.open) d.showModal();
    if (!modalOpen && d.open) d.close();
  }, [modalOpen]);

  function loadInto(slot: PertemuanSlot) {
    const k = slot.keterangan;
    setKondisi(k?.kondisi ?? 'KBBS');
    setLatihanDiberikan(k?.latihan_diberikan ?? true);
    setStatusLatihan(k?.status_latihan ?? 'SML');
    setCatatan(k?.catatan ?? '');
    setEditingKey(slotKey(slot));
    setError(null);
    setSuccess(null);
  }

  function openEdit(slot: PertemuanSlot) {
    loadInto(slot);
    setModalOpen(true);
  }

  function handleSubmit(fd: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await submitKeteranganHarian(undefined, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.ok && editing) {
        const updated: SlotKeterangan = {
          kondisi,
          terlambat: false,
          latihan_diberikan: kondisi === 'LIBUR' ? null : latihanDiberikan,
          status_latihan: kondisi !== 'LIBUR' && latihanDiberikan ? statusLatihan : null,
          semua_selesai: kondisi !== 'LIBUR' && latihanDiberikan ? statusLatihan === 'SML' : null,
          catatan: catatan || null,
          editable: true,
        };
        setSlots((prev) =>
          prev.map((s) => (slotKey(s) === slotKey(editing) ? { ...s, keterangan: updated } : s))
        );
        setSuccess('Keterangan berhasil disimpan.');
        setTimeout(() => setModalOpen(false), 1000);
      }
    });
  }

  const locked = editing?.keterangan?.editable === false;

  const formUI = editing && (
    <div style={{ padding: '16px 20px' }}>
      <h3 className="t-h2" style={{ marginBottom: 4 }}>
        {editing.keterangan ? 'Edit Keterangan' : 'Isi Keterangan'}
      </h3>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        {halaqahName} — {pengajarName} — Pertemuan {editing.pertemuanNo} · {editing.hari} {editing.tanggal}
      </p>

      <form action={handleSubmit}>
        <input type="hidden" name="pertemuan_no" value={editing.pertemuanNo} />
        <input type="hidden" name="level" value={editing.level} />
        <input type="hidden" name="tanggal" value={editing.tanggal} />
        <input type="hidden" name="terlambat" value="false" />
        <input type="hidden" name="latihan_diberikan" value={String(latihanDiberikan)} />
        <input type="hidden" name="semua_selesai" value={String(statusLatihan === 'SML')} />

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Keterangan Pengajar</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(Object.keys(HITS_KONDISI_LABEL) as HitsKondisi[]).map((k) => (
              <label
                key={k}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  border: `1px solid ${kondisi === k ? 'var(--accent)' : 'var(--line-2)'}`,
                  borderRadius: 8, cursor: locked ? 'not-allowed' : 'pointer',
                  background: kondisi === k ? 'var(--accent-tint)' : 'transparent',
                }}
              >
                <input
                  type="radio" name="kondisi" value={k} required disabled={locked}
                  checked={kondisi === k} onChange={() => setKondisi(k)}
                />
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{k}</span>
                  <span className="t-small" style={{ marginLeft: 8 }}>{HITS_KONDISI_LABEL[k]}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {kondisi !== 'LIBUR' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">Latihan mandiri diberikan?</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[true, false].map((v) => (
                  <button
                    type="button" key={String(v)} disabled={locked}
                    onClick={() => setLatihanDiberikan(v)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 8, cursor: locked ? 'not-allowed' : 'pointer',
                      border: `1px solid ${latihanDiberikan === v ? 'var(--accent)' : 'var(--line-2)'}`,
                      background: latihanDiberikan === v ? 'var(--accent-tint)' : 'transparent',
                      fontWeight: 500, fontSize: 13,
                    }}
                  >
                    {v ? 'Ya' : 'Tidak'}
                  </button>
                ))}
              </div>
            </div>

            {latihanDiberikan && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label">Status latihan mandiri</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(Object.keys(HITS_STATUS_LATIHAN_LABEL) as HitsStatusLatihan[]).map((s) => (
                      <label
                        key={s}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          border: `1px solid ${statusLatihan === s ? 'var(--accent)' : 'var(--line-2)'}`,
                          borderRadius: 8, cursor: locked ? 'not-allowed' : 'pointer',
                          background: statusLatihan === s ? 'var(--accent-tint)' : 'transparent',
                        }}
                      >
                        <input
                          type="radio" name="status_latihan" value={s} disabled={locked}
                          checked={statusLatihan === s} onChange={() => setStatusLatihan(s)}
                        />
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{s}</span>
                          <span className="t-small" style={{ marginLeft: 8 }}>{HITS_STATUS_LATIHAN_LABEL[s]}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Catatan (opsional)</label>
          <textarea
            name="catatan" className="textarea" value={catatan} disabled={locked}
            onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan tambahan..."
          />
        </div>

        {error && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}
        {success && <p className="t-small" style={{ color: 'var(--success, #4caf50)', marginBottom: 8 }}>{success}</p>}

        {locked ? (
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>Pertemuan ini sudah dikunci.</p>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={pending} style={{ flex: 1 }}>
              {pending ? 'Menyimpan...' : 'Simpan Keterangan'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Batal</button>
          </div>
        )}
      </form>
    </div>
  );

  return (
    <>
      <dialog
        ref={dialogRef}
        style={{
          border: 'none', borderRadius: 16, padding: 0, maxWidth: 480, width: '90vw',
          background: 'var(--surface)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          maxHeight: '90vh', overflow: 'auto',
        }}
        onClose={() => setModalOpen(false)}
      >
        {formUI}
      </dialog>

      <div className="card-flat" style={{ overflow: 'auto' }}>
        <table className="k-table" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              <th>Pertemuan</th>
              <th>Tanggal</th>
              <th>Keterangan</th>
              <th>Latihan</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                  Belum ada pertemuan berlangsung.
                </td>
              </tr>
            ) : (
              slots.map((s) => {
                const k = s.keterangan;
                return (
                  <tr key={slotKey(s)} style={s.isToday ? { background: 'var(--accent-tint)' } : undefined}>
                    <td className="nm">
                      {s.pertemuanNo}{s.isToday ? ' (hari ini)' : ''}
                      <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{s.levelLabel}</div>
                    </td>
                    <td className="t-small">{s.hari} {s.tanggal}</td>
                    <td>
                      {k ? (
                        <span
                          className="badge"
                          style={{
                            background: k.kondisi === 'KBBS' ? 'var(--hijau-tint)' : k.kondisi === 'LIBUR' ? 'var(--surface-3)' : 'var(--kuning-tint)',
                            borderColor: k.kondisi === 'KBBS' ? 'var(--hijau-line)' : k.kondisi === 'LIBUR' ? 'var(--line)' : 'var(--kuning-line)',
                            color: k.kondisi === 'KBBS' ? 'var(--hijau-ink)' : k.kondisi === 'LIBUR' ? 'var(--muted)' : 'var(--kuning-ink)',
                          }}
                        >
                          {k.kondisi}
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' }}>
                          Belum diisi
                        </span>
                      )}
                    </td>
                    <td>{!k || k.kondisi === 'LIBUR' ? '—' : k.latihan_diberikan ? 'Ya' : 'Tidak'}</td>
                    <td>{k?.status_latihan ?? '—'}</td>
                    <td>
                      <button onClick={() => openEdit(s)} className="act-btn">
                        {k ? (k.editable === false ? 'Lihat' : 'Edit') : 'Isi'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
