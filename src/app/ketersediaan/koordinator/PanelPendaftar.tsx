'use client';

import { useState } from 'react';
import type { KsPemetaanKolom, KsPendaftarSumber } from '@/types/db';
import { intipKolomCsv, simpanSumberPendaftar, tarikPendaftarSekarang } from './actions';
import { Bagian, useAksi } from './ui';

const MEDAN: { kunci: keyof KsPemetaanKolom; label: string }[] = [
  { kunci: 'timestamp', label: 'Timestamp' },
  { kunci: 'nama', label: 'Nama' },
  { kunci: 'wa', label: 'Nomor WhatsApp' },
  { kunci: 'tanggal_lahir', label: 'Tanggal lahir' },
  { kunci: 'gender', label: 'Jenis kelamin' },
  { kunci: 'level', label: 'Level' },
  { kunci: 'slot', label: 'Slot waktu' },
];

export function PanelPendaftar({
  periodeId,
  sumber,
}: {
  periodeId: string;
  sumber: KsPendaftarSumber[];
}) {
  const yangAda = sumber[0] ?? null;
  const { pending, jalan, tampilan } = useAksi();

  const [nama, setNama] = useState(yangAda?.nama ?? 'Responses pendaftaran murid');
  const [csvUrl, setCsvUrl] = useState(yangAda?.csv_url ?? '');
  const [petakan, setPetakan] = useState<KsPemetaanKolom>(yangAda?.pemetaan_kolom ?? {});
  const [kepala, setKepala] = useState<string[]>([]);

  return (
    <Bagian
      judul="Sumber pendaftar murid"
      keterangan="Responses Google Form ditarik sebagai CSV publish-to-web. Kolomnya dipetakan di sini, bukan di kode — bentuk form boleh berubah tanpa mengubah aplikasi."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Nama sumber</span>
          <input className="input" value={nama} onChange={(e) => setNama(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '2 1 340px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>URL CSV</span>
          <input
            className="input"
            value={csvUrl}
            onChange={(e) => setCsvUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>"
          />
        </label>
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending || !csvUrl}
          onClick={() =>
            jalan(
              () => intipKolomCsv({ csvUrl }),
              (data) => {
                const d = data as { kepala?: string[]; usulan?: KsPemetaanKolom } | undefined;
                if (d?.kepala) setKepala(d.kepala);
                if (d?.usulan && Object.keys(petakan).length === 0) setPetakan(d.usulan);
              }
            )
          }
        >
          Intip kolom
        </button>
      </div>

      {kepala.length > 0 && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
          Kolom terbaca: {kepala.join(' | ')}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
          marginTop: 10,
        }}
      >
        {MEDAN.map((m) => (
          <label key={m.kunci} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="t-small" style={{ color: 'var(--muted-2)' }}>{m.label}</span>
            {kepala.length > 0 ? (
              <select
                className="input"
                value={petakan[m.kunci] ?? ''}
                onChange={(e) => setPetakan({ ...petakan, [m.kunci]: e.target.value || undefined })}
              >
                <option value="">— tidak dipakai —</option>
                {kepala.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={petakan[m.kunci] ?? ''}
                onChange={(e) => setPetakan({ ...petakan, [m.kunci]: e.target.value || undefined })}
                placeholder="nama kolom persis di sheet"
              />
            )}
          </label>
        ))}
      </div>

      {tampilan}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            jalan(() =>
              simpanSumberPendaftar({
                periodeId,
                sumberId: yangAda?.id,
                nama,
                csvUrl,
                pemetaan: petakan,
              })
            )
          }
        >
          Simpan sumber
        </button>
        <button
          className="btn btn-sm"
          disabled={pending || !yangAda}
          onClick={() => jalan(() => tarikPendaftarSekarang({ periodeId }))}
        >
          Tarik sekarang
        </button>
      </div>

      {yangAda?.terakhir_tarik && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
          Tarikan terakhir {new Date(yangAda.terakhir_tarik).toLocaleString('id-ID')} —{' '}
          {yangAda.terakhir_status === 'gagal' ? 'GAGAL: ' : ''}
          {yangAda.terakhir_pesan ?? '—'}
        </p>
      )}
    </Bagian>
  );
}
