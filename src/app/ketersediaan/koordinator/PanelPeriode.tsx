'use client';

import { useState } from 'react';
import type { KsPeriode } from '@/types/db';
import {
  buatPeriode,
  nyalakanKirimNyata,
  tetapkanTujuanTilawah,
  ubahAturanPeriode,
} from './actions';
import { Angka, Bagian, Kotak, useAksi } from './ui';

interface Props {
  periode: KsPeriode | null;
  daftarPeriode: { id: string; nama: string; aktif: boolean }[];
  superadmin: boolean;
}

export function PanelPeriode({ periode, superadmin }: Props) {
  return periode ? (
    <>
      <AturanPeriode periode={periode} />
      <TujuanTilawah periode={periode} superadmin={superadmin} />
    </>
  ) : (
    <PeriodeBaru />
  );
}

function PeriodeBaru() {
  const { pending, jalan, tampilan } = useAksi();
  const [nama, setNama] = useState('');
  const [mulai, setMulai] = useState('');
  const [selesai, setSelesai] = useState('');
  const [minimalSlot, setMinimalSlot] = useState(3);
  const [kapasitas, setKapasitas] = useState(12);
  const [isiBawaan, setIsiBawaan] = useState(true);

  return (
    <Bagian
      judul="Buat periode"
      keterangan="Periode lepas dari batch HITS — satu periode boleh melahirkan halaqah di beberapa batch."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 220px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Nama periode</span>
          <input
            className="input"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="September–Oktober 2026"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Mulai</span>
          <input className="input" type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Selesai</span>
          <input className="input" type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} />
        </label>
        <Angka label="Minimal slot" nilai={minimalSlot} ubah={setMinimalSlot} min={0} max={50} />
        <Angka label="Kapasitas halaqah" nilai={kapasitas} ubah={setKapasitas} min={1} max={100} />
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <input type="checkbox" checked={isiBawaan} onChange={(e) => setIsiBawaan(e.target.checked)} />
        <span className="t-small">
          Isi master slot dari daftar bawaan (27 slot dari template). Slot offline masih perlu diisi lokasinya.
        </span>
      </label>

      {tampilan}

      <button
        className="btn"
        style={{ marginTop: 10 }}
        disabled={pending}
        onClick={() =>
          jalan(() =>
            buatPeriode({ nama, mulai, selesai, minimalSlot, kapasitas, isiSlotBawaan: isiBawaan })
          )
        }
      >
        {pending ? 'Membuat…' : 'Buat periode'}
      </button>
    </Bagian>
  );
}

function AturanPeriode({ periode }: { periode: KsPeriode }) {
  const { pending, jalan, tampilan } = useAksi();
  const [minimalSlot, setMinimalSlot] = useState(periode.minimal_slot);
  const [kapasitas, setKapasitas] = useState(periode.kapasitas_halaqah);
  const [ambangBentuk, setAmbangBentuk] = useState(periode.ambang_bentuk);
  const [ambangBawah, setAmbangBawah] = useState(periode.ambang_bawah);
  const [usiaMaks, setUsiaMaks] = useState(periode.usia_antrean_maks_hari);
  const [jedaMulai, setJedaMulai] = useState(periode.jeda_mulai_hari);
  const [tenggat, setTenggat] = useState(periode.tenggat_konfirmasi_jam);
  const [penyegaran, setPenyegaran] = useState(periode.penyegaran_hari);

  return (
    <Bagian
      judul="Aturan periode"
      keterangan="Angka-angka ini yang dipakai mesin: kapan halaqah boleh dibentuk, berapa lama antrean boleh menunggu, dan berapa lama pengajar punya waktu mengonfirmasi."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Angka label="Minimal slot" nilai={minimalSlot} ubah={setMinimalSlot} min={0} max={50} />
        <Angka label="Kapasitas halaqah" nilai={kapasitas} ubah={setKapasitas} min={1} max={100} />
        <Angka label="Ambang bentuk" nilai={ambangBentuk} ubah={setAmbangBentuk} min={1} max={100} />
        <Angka label="Ambang bawah" nilai={ambangBawah} ubah={setAmbangBawah} min={1} max={100} />
        <Angka label="Batas antrean (hari)" nilai={usiaMaks} ubah={setUsiaMaks} min={1} max={365} />
        <Angka label="Jeda mulai (hari)" nilai={jedaMulai} ubah={setJedaMulai} min={0} max={90} />
        <Angka label="Tenggat konfirmasi (jam)" nilai={tenggat} ubah={setTenggat} min={1} max={720} />
        <Angka label="Penyegaran (hari)" nilai={penyegaran} ubah={setPenyegaran} min={1} max={365} />
      </div>
      {tampilan}
      <button
        className="btn btn-sm"
        style={{ marginTop: 8 }}
        disabled={pending}
        onClick={() =>
          jalan(() =>
            ubahAturanPeriode({
              periodeId: periode.id,
              minimalSlot,
              kapasitas,
              ambangBentuk,
              ambangBawah,
              usiaAntreanMaksHari: usiaMaks,
              jedaMulaiHari: jedaMulai,
              tenggatKonfirmasiJam: tenggat,
              penyegaranHari: penyegaran,
            })
          )
        }
      >
        {pending ? 'Menyimpan…' : 'Simpan aturan'}
      </button>
    </Bagian>
  );
}

function TujuanTilawah({ periode, superadmin }: { periode: KsPeriode; superadmin: boolean }) {
  const { pending, jalan, tampilan } = useAksi();
  const [program, setProgram] = useState(periode.tilawah_program_id ?? 0);
  const [batch, setBatch] = useState(periode.tilawah_batch_id ?? 0);

  return (
    <Bagian
      judul="Tujuan CMS tilawah"
      keterangan="Halaqah yang dibentuk akan dikirim ke batch ini. CMS tidak punya endpoint pembuat batch — batch harus sudah ada, dibuat manual dari UI tilawah."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <Angka label="program_id" nilai={program} ubah={setProgram} min={0} />
        <Angka label="batch_id" nilai={batch} ubah={setBatch} min={0} />
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            jalan(() =>
              tetapkanTujuanTilawah({
                periodeId: periode.id,
                programId: program || null,
                batchId: batch || null,
              })
            )
          }
        >
          Simpan tujuan
        </button>
      </div>

      <Kotak nada={periode.kirim_nyata ? 'baik' : 'netral'}>
        {periode.kirim_nyata
          ? 'Pengiriman NYATA aktif — outbox akan memanggil CMS tilawah sungguhan.'
          : 'Mode kirim-percobaan: outbox hanya mencatat payload, tidak memanggil CMS tilawah.'}
      </Kotak>

      {superadmin ? (
        <>
          {tampilan}
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              jalan(() => nyalakanKirimNyata({ periodeId: periode.id, nyala: !periode.kirim_nyata }))
            }
          >
            {periode.kirim_nyata ? 'Matikan pengiriman nyata' : 'Nyalakan pengiriman nyata'}
          </button>
          {!periode.kirim_nyata && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
              CMS tilawah tidak menyediakan endpoint hapus. Halaqah dan akun murid yang salah
              terkirim hanya dapat dibereskan manual dari dalam CMS — nyalakan setelah satu
              halaqah uji terbukti benar.
            </p>
          )}
        </>
      ) : (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Menyalakan pengiriman nyata dikunci untuk superadmin.
        </p>
      )}
    </Bagian>
  );
}
