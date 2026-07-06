'use client';
import { useState, useTransition } from 'react';
import { setKajianLibur, hapusKajianLibur } from './actions';
import type { HitsKajianLibur } from '@/types/db';

export function KajianLiburPanel({ libur }: { libur: HitsKajianLibur[] }) {
  const [pending, start] = useTransition();
  const [tanggal, setTanggal] = useState('');
  const [ket, setKet] = useState('');

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end flex-wrap">
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Keterangan" value={ket} onChange={(e) => setKet(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <button disabled={pending || !tanggal} onClick={() => start(async () => { await setKajianLibur(tanggal, ket); setTanggal(''); setKet(''); })}
          className="px-3 py-1 rounded bg-sky-600 text-white text-sm disabled:opacity-50">Tambah Libur</button>
      </div>
      <ul className="text-sm">
        {libur.map((l) => (
          <li key={l.id} className="flex items-center justify-between border-b py-1">
            <span>{l.tanggal}{l.keterangan ? ` · ${l.keterangan}` : ''}</span>
            <button disabled={pending} onClick={() => start(async () => { await hapusKajianLibur(l.tanggal); })}
              className="text-red-600 text-xs">Hapus</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
