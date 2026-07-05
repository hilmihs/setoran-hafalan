'use client';

import { useState, useEffect, useRef, useTransition, type ReactNode } from 'react';
import { submitKeteranganHarian, ajukanHapusPertemuan } from './actions';
import {
  HITS_STATUS_LATIHAN_LABEL,
  HITS_PELANGGARAN_LABEL,
  HITS_JKG_OPSI_LABEL,
} from '@/types/db';
import type { HitsKondisi, HitsStatusLatihan, HitsLevel, HitsPelanggaranJenis } from '@/types/db';

export type SlotPelanggaran = {
  jenis: HitsPelanggaranJenis;
  menit: number | null;
  jkg_opsi: 'ganti_hari' | 'cicil' | null;
  cicil_n: 2 | 3 | null;
  badal_nama: string | null;
  badal_mulai: 'sesuai' | 'lebih_awal' | null;
};

export type SlotKeterangan = {
  kondisi: HitsKondisi;
  terlambat: boolean;
  latihan_diberikan: boolean | null;
  status_latihan: HitsStatusLatihan | null;
  semua_selesai: boolean | null;
  catatan: string | null;
  editable: boolean;
  pelanggaran: SlotPelanggaran[];
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

// Pelanggaran waktu/jadwal yang dicentang manual (TIDAK_LATIHAN diturunkan dari
// toggle "latihan diberikan").
const PEL_JENIS: Array<'KMT' | 'KBLA' | 'JKG' | 'BADAL'> = ['KMT', 'KBLA', 'JKG', 'BADAL'];

type PelDraft = {
  KMT: { on: boolean; menit: string };
  KBLA: { on: boolean; menit: string };
  JKG: { on: boolean; jkg_opsi: 'ganti_hari' | 'cicil'; cicil_n: 2 | 3 };
  BADAL: { on: boolean; badal_nama: string; badal_mulai: 'sesuai' | 'lebih_awal' };
};

const emptyPel = (): PelDraft => ({
  KMT: { on: false, menit: '' },
  KBLA: { on: false, menit: '' },
  JKG: { on: false, jkg_opsi: 'ganti_hari', cicil_n: 2 },
  BADAL: { on: false, badal_nama: '', badal_mulai: 'sesuai' },
});

function pelFromSlot(k: SlotKeterangan | null): PelDraft {
  const d = emptyPel();
  for (const p of k?.pelanggaran ?? []) {
    if (p.jenis === 'KMT') d.KMT = { on: true, menit: p.menit != null ? String(p.menit) : '' };
    else if (p.jenis === 'KBLA') d.KBLA = { on: true, menit: p.menit != null ? String(p.menit) : '' };
    else if (p.jenis === 'JKG')
      d.JKG = { on: true, jkg_opsi: p.jkg_opsi ?? 'ganti_hari', cicil_n: (p.cicil_n ?? 2) as 2 | 3 };
    else if (p.jenis === 'BADAL')
      d.BADAL = { on: true, badal_nama: p.badal_nama ?? '', badal_mulai: p.badal_mulai ?? 'sesuai' };
  }
  return d;
}

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

  // Pengajuan hapus pertemuan (kelebihan/salah) → koordinator KK.
  const hapusDialogRef = useRef<HTMLDialogElement>(null);
  const [hapusSlot, setHapusSlot] = useState<PertemuanSlot | null>(null);
  const [hapusAlasan, setHapusAlasan] = useState('');
  const [hapusWaUrl, setHapusWaUrl] = useState<string | null>(null);
  const [hapusError, setHapusError] = useState<string | null>(null);
  const [hapusPending, startHapus] = useTransition();

  useEffect(() => {
    const d = hapusDialogRef.current;
    if (!d) return;
    if (hapusSlot && !d.open) d.showModal();
    if (!hapusSlot && d.open) d.close();
  }, [hapusSlot]);

  function openHapus(slot: PertemuanSlot) {
    setHapusSlot(slot);
    setHapusAlasan('');
    setHapusWaUrl(null);
    setHapusError(null);
  }

  function submitHapus() {
    if (!hapusSlot) return;
    setHapusError(null);
    startHapus(async () => {
      const fd = new FormData();
      fd.set('pertemuan_no', String(hapusSlot.pertemuanNo));
      fd.set('level', hapusSlot.level);
      fd.set('tanggal', hapusSlot.tanggal);
      fd.set('alasan', hapusAlasan);
      const res = await ajukanHapusPertemuan(undefined, fd);
      if (res?.error && !res.ok) { setHapusError(res.error); return; }
      setHapusWaUrl(res?.waUrl ?? null);
      if (res?.ok && !res.waUrl) setHapusError(res.error ?? 'Pengajuan tersimpan.');
    });
  }

  const editing = slots.find((s) => slotKey(s) === editingKey) ?? null;

  // ---- state form observasi (model multi-pelanggaran) ----
  const [libur, setLibur] = useState(false);
  const [pel, setPel] = useState<PelDraft>(emptyPel());
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
    setLibur(k?.kondisi === 'LIBUR');
    setPel(pelFromSlot(k));
    // latihan_diberikan default true bila belum diisi; false bila TIDAK_LATIHAN.
    setLatihanDiberikan(k ? k.latihan_diberikan !== false : true);
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

  function togglePel(j: 'KMT' | 'KBLA' | 'JKG' | 'BADAL') {
    setPel((prev) => ({ ...prev, [j]: { ...prev[j], on: !prev[j].on } }));
  }

  // Derive kondisi headline & pelanggaran list (utk update lokal setelah simpan).
  function derive() {
    const list: HitsPelanggaranJenis[] = [];
    if (!libur) {
      for (const j of PEL_JENIS) if (pel[j].on) list.push(j);
      if (!latihanDiberikan) list.push('TIDAK_LATIHAN');
    }
    let kondisi: HitsKondisi = 'KBBS';
    if (libur) kondisi = 'LIBUR';
    else if (list.includes('JKG') || list.includes('BADAL')) kondisi = 'JKG';
    else if (list.includes('KBLA')) kondisi = 'KBLA';
    else if (list.includes('KMT')) kondisi = 'KMT';
    return { list, kondisi };
  }

  function buildPayload(): { ok: boolean; fd?: FormData; err?: string } {
    if (!editing) return { ok: false };
    const fd = new FormData();
    fd.set('pertemuan_no', String(editing.pertemuanNo));
    fd.set('level', editing.level);
    fd.set('tanggal', editing.tanggal);
    fd.set('libur', String(libur));
    fd.set('latihan_diberikan', String(!libur && latihanDiberikan));
    fd.set('status_latihan', statusLatihan);
    fd.set('catatan', catatan);

    const payload: Array<Record<string, unknown>> = [];
    if (!libur) {
      if (pel.KMT.on) {
        const m = Number(pel.KMT.menit);
        if (!Number.isFinite(m) || m < 0) return { ok: false, err: 'KMT: isi jumlah menit keterlambatan.' };
        payload.push({ jenis: 'KMT', menit: m });
      }
      if (pel.KBLA.on) {
        const m = Number(pel.KBLA.menit);
        if (!Number.isFinite(m) || m < 0) return { ok: false, err: 'KBLA: isi jumlah menit lebih awal.' };
        payload.push({ jenis: 'KBLA', menit: m });
      }
      if (pel.JKG.on) {
        payload.push({
          jenis: 'JKG',
          jkg_opsi: pel.JKG.jkg_opsi,
          cicil_n: pel.JKG.jkg_opsi === 'cicil' ? pel.JKG.cicil_n : null,
        });
      }
      if (pel.BADAL.on) {
        if (!pel.BADAL.badal_nama.trim()) return { ok: false, err: 'BADAL: isi nama pengajar pengganti.' };
        payload.push({ jenis: 'BADAL', badal_nama: pel.BADAL.badal_nama.trim(), badal_mulai: pel.BADAL.badal_mulai });
      }
    }
    fd.set('pelanggaran', JSON.stringify(payload));
    return { ok: true, fd };
  }

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    const built = buildPayload();
    if (!built.ok || !built.fd) {
      setError(built.err ?? 'Data tidak valid.');
      return;
    }
    const fd = built.fd;
    startTransition(async () => {
      const res = await submitKeteranganHarian(undefined, fd);
      if (res?.error) { setError(res.error); return; }
      if (res?.ok && editing) {
        const { list, kondisi } = derive();
        const pelList: SlotPelanggaran[] = list.map((j) => ({
          jenis: j,
          menit: j === 'KMT' ? Number(pel.KMT.menit) : j === 'KBLA' ? Number(pel.KBLA.menit) : null,
          jkg_opsi: j === 'JKG' ? pel.JKG.jkg_opsi : null,
          cicil_n: j === 'JKG' && pel.JKG.jkg_opsi === 'cicil' ? pel.JKG.cicil_n : null,
          badal_nama: j === 'BADAL' ? pel.BADAL.badal_nama.trim() : null,
          badal_mulai: j === 'BADAL' ? pel.BADAL.badal_mulai : null,
        }));
        const updated: SlotKeterangan = {
          kondisi,
          terlambat: list.includes('KMT'),
          latihan_diberikan: libur ? null : latihanDiberikan,
          status_latihan: !libur && latihanDiberikan ? statusLatihan : null,
          semua_selesai: !libur && latihanDiberikan ? statusLatihan === 'SML' : null,
          catatan: catatan || null,
          editable: true,
          pelanggaran: pelList,
        };
        setSlots((prev) =>
          prev.map((s) => (slotKey(s) === slotKey(editing) ? { ...s, keterangan: updated } : s))
        );
        setSuccess('Keterangan berhasil disimpan.');
        setTimeout(() => setModalOpen(false), 900);
      }
    });
  }

  const anyPelChecked = PEL_JENIS.some((j) => pel[j].on) || !latihanDiberikan;

  const checkboxRow = (
    j: 'KMT' | 'KBLA' | 'JKG' | 'BADAL',
    children?: ReactNode
  ) => (
    <div
      key={j}
      style={{
        border: `1px solid ${pel[j].on ? 'var(--accent)' : 'var(--line-2)'}`,
        borderRadius: 8, background: pel[j].on ? 'var(--accent-tint)' : 'transparent',
        padding: '10px 14px', marginBottom: 6,
      }}
    >
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={pel[j].on} onChange={() => togglePel(j)} style={{ marginTop: 3 }} />
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{j}</span>
          <span className="t-small" style={{ marginLeft: 8 }}>{HITS_PELANGGARAN_LABEL[j]}</span>
        </div>
      </label>
      {pel[j].on && children && <div style={{ marginTop: 10, paddingLeft: 28 }}>{children}</div>}
    </div>
  );

  const formUI = editing && (
    <div style={{ padding: '16px 20px' }}>
      <h3 className="t-h2" style={{ marginBottom: 4 }}>
        {editing.keterangan ? 'Edit Keterangan' : 'Isi Keterangan'}
      </h3>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        {halaqahName} — {pengajarName} — Pertemuan {editing.pertemuanNo} · {editing.hari} {editing.tanggal}
      </p>

      {/* Libur toggle: mutually exclusive dengan pelanggaran/latihan. */}
      <label
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14,
          border: `1px solid ${libur ? 'var(--accent)' : 'var(--line-2)'}`, borderRadius: 8,
          background: libur ? 'var(--accent-tint)' : 'transparent', cursor: 'pointer',
        }}
      >
        <input type="checkbox" checked={libur} onChange={() => setLibur((v) => !v)} />
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>LIBUR</span>
          <span className="t-small" style={{ marginLeft: 8 }}>Tidak ada kelas pada pertemuan ini</span>
        </div>
      </label>

      {!libur && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label className="field-label">Pelanggaran (centang bila ada)</label>
            <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
              Bisa lebih dari satu. Tanpa centang & latihan diberikan = KBBS (kelas berjalan baik).
            </p>

            {checkboxRow('KMT', (
              <div>
                <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Terlambat berapa menit? (mentah)</label>
                <input
                  type="number" min={0} className="input" style={{ maxWidth: 140 }}
                  value={pel.KMT.menit}
                  onChange={(e) => setPel((p) => ({ ...p, KMT: { ...p.KMT, menit: e.target.value } }))}
                  placeholder="menit"
                />
              </div>
            ))}

            {checkboxRow('KBLA', (
              <div>
                <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Berakhir lebih awal berapa menit? (mentah)</label>
                <input
                  type="number" min={0} className="input" style={{ maxWidth: 140 }}
                  value={pel.KBLA.menit}
                  onChange={(e) => setPel((p) => ({ ...p, KBLA: { ...p.KBLA, menit: e.target.value } }))}
                  placeholder="menit"
                />
              </div>
            ))}

            {checkboxRow('JKG', (
              <div>
                <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Tindak lanjut</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(['ganti_hari', 'cicil'] as const).map((o) => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="radio" name="jkg_opsi" checked={pel.JKG.jkg_opsi === o}
                        onChange={() => setPel((p) => ({ ...p, JKG: { ...p.JKG, jkg_opsi: o } }))}
                      />
                      {HITS_JKG_OPSI_LABEL[o]}
                    </label>
                  ))}
                </div>
                {pel.JKG.jkg_opsi === 'cicil' && (
                  <div style={{ marginTop: 8 }}>
                    <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Jumlah cicilan</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([2, 3] as const).map((n) => (
                        <button
                          type="button" key={n}
                          onClick={() => setPel((p) => ({ ...p, JKG: { ...p.JKG, cicil_n: n } }))}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                            border: `1px solid ${pel.JKG.cicil_n === n ? 'var(--accent)' : 'var(--line-2)'}`,
                            background: pel.JKG.cicil_n === n ? 'var(--accent-tint)' : 'transparent',
                          }}
                        >
                          {n === 2 ? '2× 45′' : '3× 30′'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {checkboxRow('BADAL', (
              <div>
                <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Nama pengajar pengganti</label>
                <input
                  type="text" className="input" style={{ marginBottom: 8 }}
                  value={pel.BADAL.badal_nama}
                  onChange={(e) => setPel((p) => ({ ...p, BADAL: { ...p.BADAL, badal_nama: e.target.value } }))}
                  placeholder="Nama badal"
                />
                <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Mulai kelas</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['sesuai', 'lebih_awal'] as const).map((m) => (
                    <button
                      type="button" key={m}
                      onClick={() => setPel((p) => ({ ...p, BADAL: { ...p.BADAL, badal_mulai: m } }))}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${pel.BADAL.badal_mulai === m ? 'var(--accent)' : 'var(--line-2)'}`,
                        background: pel.BADAL.badal_mulai === m ? 'var(--accent-tint)' : 'transparent',
                      }}
                    >
                      {m === 'sesuai' ? 'Sesuai jadwal' : 'Lebih awal'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="field-label">Latihan mandiri diberikan?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[true, false].map((v) => (
                <button
                  type="button" key={String(v)}
                  onClick={() => setLatihanDiberikan(v)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${latihanDiberikan === v ? 'var(--accent)' : 'var(--line-2)'}`,
                    background: latihanDiberikan === v ? 'var(--accent-tint)' : 'transparent',
                    fontWeight: 500, fontSize: 13,
                  }}
                >
                  {v ? 'Ya' : 'Tidak (pelanggaran)'}
                </button>
              ))}
            </div>
          </div>

          {latihanDiberikan && (
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">Status latihan mandiri</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(Object.keys(HITS_STATUS_LATIHAN_LABEL) as HitsStatusLatihan[]).map((s) => (
                  <label
                    key={s}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      border: `1px solid ${statusLatihan === s ? 'var(--accent)' : 'var(--line-2)'}`,
                      borderRadius: 8, cursor: 'pointer',
                      background: statusLatihan === s ? 'var(--accent-tint)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio" name="status_latihan" checked={statusLatihan === s}
                      onChange={() => setStatusLatihan(s)}
                    />
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{s}</span>
                      <span className="t-small" style={{ marginLeft: 8 }}>{HITS_STATUS_LATIHAN_LABEL[s]}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!anyPelChecked && (
            <p className="t-small" style={{ color: 'var(--hijau-ink)', marginBottom: 8 }}>
              ✓ Tidak ada pelanggaran → tercatat KBBS.
            </p>
          )}
        </>
      )}

      <div style={{ marginBottom: 14 }}>
        <label className="field-label">Catatan (opsional)</label>
        <textarea
          className="textarea" value={catatan}
          onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan tambahan..."
        />
      </div>

      {error && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}
      {success && <p className="t-small" style={{ color: 'var(--success, #4caf50)', marginBottom: 8 }}>{success}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={handleSubmit} style={{ flex: 1 }}>
          {pending ? 'Menyimpan...' : 'Simpan Keterangan'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Batal</button>
      </div>
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

      <dialog
        ref={hapusDialogRef}
        style={{
          border: 'none', borderRadius: 16, padding: 0, maxWidth: 440, width: '90vw',
          background: 'var(--surface)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          maxHeight: '90vh', overflow: 'auto',
        }}
        onClose={() => setHapusSlot(null)}
      >
        {hapusSlot && (
          <div style={{ padding: '16px 20px' }}>
            <h3 className="t-h2" style={{ marginBottom: 4 }}>Ajukan Hapus Pertemuan</h3>
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
              Pertemuan {hapusSlot.pertemuanNo} · {hapusSlot.hari} {hapusSlot.tanggal}. Pengajuan dikirim
              ke koordinator ketua kelas untuk disetujui/ditolak.
            </p>

            {hapusWaUrl ? (
              <div style={{ textAlign: 'center' }}>
                <p className="t-body" style={{ fontWeight: 600, color: 'var(--hijau-ink)', marginBottom: 12 }}>
                  Pengajuan tersimpan.
                </p>
                <a href={hapusWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}>
                  Kirim ke koordinator via WhatsApp
                </a>
                <button className="btn-ghost" onClick={() => setHapusSlot(null)} style={{ width: '100%' }}>Tutup</button>
              </div>
            ) : (
              <>
                <label className="field-label">Alasan</label>
                <textarea
                  className="textarea"
                  value={hapusAlasan}
                  onChange={(e) => setHapusAlasan(e.target.value)}
                  placeholder="Mis. pertemuan ini kelebihan, kelas belum mulai pada tanggal tsb."
                />
                {hapusError && <p className="t-small" style={{ color: 'var(--danger)', margin: '8px 0' }}>{hapusError}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn btn-primary" disabled={hapusPending} onClick={submitHapus} style={{ flex: 1 }}>
                    {hapusPending ? 'Mengirim…' : 'Ajukan'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setHapusSlot(null)}>Batal</button>
                </div>
              </>
            )}
          </div>
        )}
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
                const jenisList = k?.pelanggaran.map((p) => p.jenis) ?? [];
                return (
                  <tr
                    key={slotKey(s)}
                    onClick={() => openEdit(s)}
                    style={{ cursor: 'pointer', ...(s.isToday ? { background: 'var(--accent-tint)' } : {}) }}
                  >
                    <td className="nm">
                      {s.pertemuanNo}{s.isToday ? ' (hari ini)' : ''}
                      <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{s.levelLabel}</div>
                    </td>
                    <td className="t-small">{s.hari} {s.tanggal}</td>
                    <td>
                      {k ? (
                        <>
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
                          {jenisList.length > 0 && (
                            <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                              {jenisList.join(', ')}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="badge" style={{ background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' }}>
                          Belum diisi
                        </span>
                      )}
                    </td>
                    <td>{!k || k.kondisi === 'LIBUR' ? '—' : k.latihan_diberikan ? 'Ya' : 'Tidak'}</td>
                    <td>{k?.status_latihan ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                          className="act-btn"
                        >
                          {k ? 'Edit' : 'Isi'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openHapus(s); }}
                          className="act-btn"
                          title="Ajukan hapus pertemuan ini (kelebihan/salah)"
                          style={{ color: 'var(--danger)' }}
                        >
                          Hapus?
                        </button>
                      </div>
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
