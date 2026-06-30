'use client';
import { useState, useTransition } from 'react';
import { submitKoreksi } from './actions';
import type { KoreksiItemInput } from '@/lib/hits-koreksi';

type Slot = { level: string; pertemuan_no: number; tanggal: string; label: string };

export function KoreksiPanel({ halaqahId, slots }: { halaqahId: string; slots: Slot[] }) {
  const [items, setItems] = useState<KoreksiItemInput[]>([]);
  const [pending, start] = useTransition();
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const add = (it: KoreksiItemInput) => setItems((p) => [...p, it]);
  const removeAt = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  function submit() {
    setErr(null);
    start(async () => {
      const res = await submitKoreksi(halaqahId, items);
      if (res?.error) { setErr(res.error); return; }
      if (res?.waUrl) setWaUrl(res.waUrl);
    });
  }

  if (waUrl) {
    return (
      <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, marginBottom: 12 }}>Pengajuan terkirim — minta persetujuan koordinator.</p>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block">Kirim WA ke koordinator</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SetMulai onAdd={add} />
      <TambahPertemuan onAdd={add} />
      <div>
        <div className="t-tiny" style={{ marginBottom: 6, color: 'var(--muted-2)' }}>Pertemuan saat ini — pilih aksi:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((s) => <SlotRow key={`${s.level}-${s.pertemuan_no}`} slot={s} onAdd={add} />)}
        </div>
      </div>
      {items.length > 0 && (
        <div className="card-flat" style={{ padding: 12 }}>
          <div className="t-tiny" style={{ marginBottom: 6 }}>Draft koreksi ({items.length}):</div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
              <span>{describe(it)}</span>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => removeAt(i)}>hapus</button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="t-small" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={pending || items.length === 0} onClick={submit}>
        {pending ? 'Mengirim…' : 'Kirim pengajuan'}
      </button>
    </div>
  );
}

function describe(it: KoreksiItemInput): string {
  if (it.jenis === 'set_mulai') return `Set mulai: ${it.tanggal}`;
  if (it.jenis === 'tambah') return `Tambah (${it.level}): ${it.tanggal}`;
  if (it.jenis === 'hapus') return `Hapus #${it.pertemuan_no} (${it.level})`;
  return `Ubah #${it.pertemuan_no} (${it.level}) → ${it.tanggal}`;
}

function SetMulai({ onAdd }: { onAdd: (it: KoreksiItemInput) => void }) {
  const [d, setD] = useState('');
  return (
    <div className="card-flat" style={{ padding: 12 }}>
      <div className="t-tiny" style={{ marginBottom: 4 }}>Set tanggal mulai kelas (observasi sebelum tanggal ini akan dihapus)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" disabled={!d} onClick={() => { onAdd({ jenis: 'set_mulai', tanggal: d }); setD(''); }}>+ set mulai</button>
      </div>
    </div>
  );
}

function TambahPertemuan({ onAdd }: { onAdd: (it: KoreksiItemInput) => void }) {
  const [lv, setLv] = useState('qoidah_nuroniyyah');
  const [d, setD] = useState('');
  return (
    <div className="card-flat" style={{ padding: 12 }}>
      <div className="t-tiny" style={{ marginBottom: 4 }}>Tambah pertemuan (yang terlewat)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={lv} onChange={(e) => setLv(e.target.value)} className="input">
          <option value="qoidah_nuroniyyah">Nuroniyyah</option>
          <option value="perbaikan_bacaan">Perbaikan</option>
        </select>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" disabled={!d} onClick={() => { onAdd({ jenis: 'tambah', level: lv as KoreksiItemInput['level'], tanggal: d }); setD(''); }}>+ tambah</button>
      </div>
    </div>
  );
}

function SlotRow({ slot, onAdd }: { slot: Slot; onAdd: (it: KoreksiItemInput) => void }) {
  const [d, setD] = useState('');
  return (
    <div className="card" style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, flex: 1 }}>{slot.label}</span>
      <button type="button" className="btn btn-xs btn-ghost" onClick={() => onAdd({ jenis: 'hapus', level: slot.level as KoreksiItemInput['level'], pertemuan_no: slot.pertemuan_no })}>hapus</button>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ width: 150 }} />
      <button type="button" className="btn btn-xs" disabled={!d} onClick={() => { onAdd({ jenis: 'ubah_tanggal', level: slot.level as KoreksiItemInput['level'], pertemuan_no: slot.pertemuan_no, tanggal: d }); setD(''); }}>ubah tgl</button>
    </div>
  );
}
