'use client';
import { useState, useTransition } from 'react';
import { remindKajianKetua } from './actions';

export type TindakItem = {
  ketuaWa: string; namaKetua: string; tanggal: string; tanggalWib: string;
  state: 'belum-isi' | 'alpa'; sisaHari: number | null;
};

export function KajianTindakPanel({ items }: { items: TindakItem[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function remind(it: TindakItem) {
    start(async () => {
      const r = await remindKajianKetua({ ketuaWa: it.ketuaWa, tanggal: it.tanggal, namaKetua: it.namaKetua, tanggalWib: it.tanggalWib });
      if (r.ok && r.waLink) { window.open(r.waLink, '_blank'); setMsg('Reminder dikirim.'); }
      else setMsg(r.error ?? 'Gagal');
    });
  }

  if (!items.length) return <p className="text-sm text-gray-500">Tak ada yang perlu ditindak.</p>;
  return (
    <div className="space-y-2">
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
          <div>
            <b>{it.namaKetua}</b> · {it.tanggalWib}
            {it.state === 'alpa'
              ? <span className="ml-2 text-red-600">Alpa</span>
              : <span className="ml-2 text-amber-600">Belum isi{it.sisaHari != null ? ` · sisa ${it.sisaHari} hari` : ''}</span>}
          </div>
          <button disabled={pending} onClick={() => remind(it)} className="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50">Reminder</button>
        </div>
      ))}
    </div>
  );
}
