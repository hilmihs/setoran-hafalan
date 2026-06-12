'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PROGRAMS = [
  { value: 'kelas_maahir', label: 'Kelas Maahir' },
  { value: 'muallim_najih', label: 'Muallim Najih' },
  { value: 'at_tibyan', label: 'At-Tibyan' },
];

export function NewPertemuanForm({ kelasName }: { kelasName: string }) {
  const router = useRouter();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const [program, setProgram] = useState('kelas_maahir');
  const [tanggal, setTanggal] = useState(today);
  const [namaKegiatan, setNamaKegiatan] = useState('Pertemuan Rutin');
  const [waktuMulai, setWaktuMulai] = useState('');
  const [waktuSelesai, setWaktuSelesai] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/2in1/pertemuan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program,
          tanggal,
          nama_kegiatan: namaKegiatan,
          waktu_mulai: waktuMulai || null,
          waktu_selesai: waktuSelesai || null,
          keterangan: keterangan || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal menyimpan');
      router.push(`/2in1/ketua-kelas/pertemuan/${json.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Program</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PROGRAMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                setProgram(p.value);
                setNamaKegiatan(p.label);
              }}
              className={program === p.value ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
              style={{ flex: 1, fontSize: 12 }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Tanggal</div>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
        />
      </div>

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Nama Kegiatan</div>
        <input
          type="text"
          value={namaKegiatan}
          onChange={(e) => setNamaKegiatan(e.target.value)}
          placeholder="mis: Pertemuan Rutin"
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div className="t-tiny" style={{ marginBottom: 4 }}>Waktu Mulai</div>
          <input
            type="time"
            value={waktuMulai}
            onChange={(e) => setWaktuMulai(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
          />
        </div>
        <div>
          <div className="t-tiny" style={{ marginBottom: 4 }}>Waktu Selesai</div>
          <input
            type="time"
            value={waktuSelesai}
            onChange={(e) => setWaktuSelesai(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
          />
        </div>
      </div>

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Keterangan (opsional)</div>
        <input
          type="text"
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="catatan tambahan..."
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
        />
      </div>

      {error && (
        <div className="banner banner-error">
          <div className="desc">{error}</div>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !tanggal || !namaKegiatan}
        className={`btn btn-block ${!submitting && tanggal && namaKegiatan ? 'btn-primary' : 'btn-soft'}`}
      >
        {submitting ? 'Menyimpan…' : 'Simpan & Isi Kehadiran →'}
      </button>
    </div>
  );
}
