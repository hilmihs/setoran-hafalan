'use client';

import { useState } from 'react';
import { isPesertaManual } from '@/lib/evaluasi-peserta';
import { LEVEL_PILIHAN } from '@/lib/evaluasi-halaqah';

export interface EditHalaqahPeserta {
  id: string;
  nama: string;
}

interface Props {
  halaqahId: string;
  /** Nama yang sedang tampil (override bila ada, selain itu nama data pusat). */
  halaqahNama: string;
  /** Nama apa adanya di data pusat — dipakai sebagai keterangan bila berbeda. */
  halaqahNamaPusat: string;
  /** Level data pusat, mis. "HITS Dasar". Bisa null. */
  levelPusat: string | null;
  /** Isi level_override; null = ikut data pusat. */
  levelOverride: string | null;
  peserta: EditHalaqahPeserta[];
  /** Mode Coba menahan semua tulisan ke server — data halaqah bukan bahan eksperimen. */
  coba: boolean;
  back: () => void;
}

type Sibuk = { jenis: 'halaqah' | 'tambah' | 'ubah' | 'hapus'; id: string } | null;

const KOTAK: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1.5px solid #e8e4dc',
  background: '#ffffff',
  font: 'inherit',
  fontSize: 14,
  color: '#1b1a17',
};

const JUDUL_BAGIAN: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#7a766f',
  marginBottom: 10,
};

const IKUT_PUSAT = '';

export function EditHalaqah({
  halaqahId,
  halaqahNama,
  halaqahNamaPusat,
  levelPusat,
  levelOverride,
  peserta,
  coba,
  back,
}: Props) {
  const [nama, setNama] = useState(halaqahNama);
  const [level, setLevel] = useState<string>(levelOverride ?? IKUT_PUSAT);
  const [namaBaru, setNamaBaru] = useState('');
  const [ubahId, setUbahId] = useState<string | null>(null);
  const [ubahNama, setUbahNama] = useState('');
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<Sibuk>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async (
    url: string,
    body: Record<string, unknown>,
    tandai: NonNullable<Sibuk>
  ): Promise<void> => {
    setGalat(null);
    setSibuk(tandai);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setGalat(data.error ?? 'Gagal menyimpan. Periksa koneksi lalu coba lagi.');
        setSibuk(null);
        return;
      }
      // Muat ulang: daftar peserta dan identitas halaqah dirakit di server
      // (page.tsx) bersama nilai dan sesi. Menambal state di klien saja berisiko
      // membuat kunci nilai meleset dari peserta yang baru muncul.
      window.location.reload();
    } catch {
      setGalat('Gagal menyimpan. Periksa koneksi lalu coba lagi.');
      setSibuk(null);
    }
  };

  const simpanHalaqah = () => {
    const bersih = nama.trim();
    if (bersih.length < 3) return;
    void kirim(
      '/api/evaluasi/halaqah/ubah',
      { halaqah_id: halaqahId, nama: bersih, level },
      { jenis: 'halaqah', id: halaqahId }
    );
  };

  const tambah = () => {
    const namaP = namaBaru.trim();
    if (!namaP) return;
    void kirim('/api/evaluasi/peserta/upsert', { halaqah_id: halaqahId, nama: namaP }, { jenis: 'tambah', id: 'baru' });
  };

  const simpanUbah = (id: string) => {
    const namaP = ubahNama.trim();
    if (!namaP) return;
    void kirim(
      '/api/evaluasi/peserta/upsert',
      { halaqah_id: halaqahId, peserta_id: id, nama: namaP },
      { jenis: 'ubah', id }
    );
  };

  const hapus = (id: string) => {
    void kirim('/api/evaluasi/peserta/hapus', { halaqah_id: halaqahId, peserta_id: id }, { jenis: 'hapus', id });
  };

  const adaProses = sibuk !== null;
  const jumlahManual = peserta.filter((p) => isPesertaManual(p.id)).length;
  const halaqahBerubah = nama.trim() !== halaqahNama || level !== (levelOverride ?? IKUT_PUSAT);
  const halaqahBisaSimpan = !coba && !adaProses && nama.trim().length >= 3 && halaqahBerubah;
  const namaDisunting = halaqahNama !== halaqahNamaPusat;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
        <button onClick={back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Edit Halaqah</div>
          <div style={{ fontSize: 11, color: '#7a766f' }}>{halaqahNama} · {peserta.length} peserta</div>
        </div>
      </div>

      {coba && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.95 0.05 85)', border: '1px solid oklch(0.85 0.08 85)', fontSize: 12, color: 'oklch(0.42 0.09 75)' }}>
          Mode Coba menyala. Data halaqah bukan bahan eksperimen — matikan Mode Coba dulu untuk mengubah.
        </div>
      )}

      {galat && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.96 0.03 25)', border: '1px solid oklch(0.86 0.07 25)', fontSize: 12, color: 'oklch(0.46 0.14 25)' }}>
          {galat}
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        <div style={JUDUL_BAGIAN}>Identitas halaqah</div>
        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#44423d', marginBottom: 6 }}>
            Nama &amp; nomor halaqah
          </label>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && halaqahBisaSimpan) simpanHalaqah(); }}
            placeholder="mis. HITS 05 IKHWAN 0747"
            disabled={coba || adaProses}
            style={{ ...KOTAK, opacity: coba ? 0.55 : 1 }}
          />
          <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 6 }}>
            {namaDisunting
              ? `Data pusat: ${halaqahNamaPusat}`
              : 'Betulkan nomornya di sini bila keliru. Perubahan hanya berlaku di modul evaluasi.'}
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#44423d', margin: '14px 0 6px' }}>
            Level
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={coba || adaProses}
            style={{ ...KOTAK, cursor: coba || adaProses ? 'not-allowed' : 'pointer', opacity: coba ? 0.55 : 1 }}
          >
            <option value={IKUT_PUSAT}>
              Ikut data pusat{levelPusat ? ` — ${levelPusat}` : ' — belum diisi'}
            </option>
            {LEVEL_PILIHAN.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 6 }}>
            Level tampil di kop rapot. Halaqah non-HITS (Nuroniyyah, DPQ, Tahfizh) sebaiknya
            dibiarkan ikut data pusat.
          </div>

          <button
            onClick={simpanHalaqah}
            disabled={!halaqahBisaSimpan}
            style={{
              marginTop: 14,
              width: '100%',
              height: 42,
              borderRadius: 10,
              border: 'none',
              background: '#1b1a17',
              color: '#ffffff',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: halaqahBisaSimpan ? 'pointer' : 'not-allowed',
              opacity: halaqahBisaSimpan ? 1 : 0.5,
            }}
          >
            {sibuk?.jenis === 'halaqah' ? '…' : 'Simpan perubahan halaqah'}
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <div style={JUDUL_BAGIAN}>Tambah peserta</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={namaBaru}
            onChange={(e) => setNamaBaru(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !coba && !adaProses) tambah(); }}
            placeholder="Nama lengkap peserta"
            disabled={coba || adaProses}
            style={{ ...KOTAK, flex: 1, opacity: coba ? 0.55 : 1 }}
          />
          <button
            onClick={tambah}
            disabled={coba || adaProses || namaBaru.trim().length < 2}
            style={{
              flexShrink: 0,
              height: 42,
              padding: '0 16px',
              borderRadius: 10,
              border: 'none',
              background: '#1b1a17',
              color: '#ffffff',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: coba || adaProses || namaBaru.trim().length < 2 ? 'not-allowed' : 'pointer',
              opacity: coba || adaProses || namaBaru.trim().length < 2 ? 0.5 : 1,
            }}
          >
            {sibuk?.jenis === 'tambah' ? '…' : 'Tambah'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 6 }}>
          Nama semua peserta bisa dibetulkan. Yang bisa dihapus hanya peserta yang Anda
          tambahkan sendiri — peserta data pusat dikeluarkan lewat koordinator.
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <div style={JUDUL_BAGIAN}>Daftar peserta ({peserta.length})</div>
        {peserta.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: 14, fontSize: 12, color: '#a8a39a' }}>
            Belum ada peserta. Tambahkan lewat kotak di atas.
          </div>
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, overflow: 'hidden' }}>
            {peserta.map((p, i) => {
              const manual = isPesertaManual(p.id);
              const sedangUbah = ubahId === p.id;
              const sedangHapus = konfirmasiHapus === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: i < peserta.length - 1 ? '1px solid #e8e4dc' : 'none',
                    background: sedangHapus ? 'oklch(0.98 0.015 25)' : 'transparent',
                  }}
                >
                  {sedangUbah ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={ubahNama}
                        onChange={(e) => setUbahNama(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !adaProses) simpanUbah(p.id); }}
                        autoFocus
                        style={{ ...KOTAK, flex: 1 }}
                      />
                      <button
                        onClick={() => simpanUbah(p.id)}
                        disabled={adaProses || ubahNama.trim().length < 2}
                        style={{ flexShrink: 0, height: 42, padding: '0 14px', borderRadius: 10, border: 'none', background: '#1b1a17', color: '#ffffff', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adaProses || ubahNama.trim().length < 2 ? 0.5 : 1 }}
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => setUbahId(null)}
                        style={{ flexShrink: 0, height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 13, color: '#7a766f', cursor: 'pointer' }}
                      >
                        Batal
                      </button>
                    </div>
                  ) : sedangHapus ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'oklch(0.46 0.14 25)' }}>
                        Hapus <strong>{p.nama}</strong> beserta nilainya?
                      </div>
                      <button
                        onClick={() => hapus(p.id)}
                        disabled={adaProses}
                        style={{ flexShrink: 0, height: 34, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', color: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: adaProses ? 0.5 : 1 }}
                      >
                        {sibuk?.jenis === 'hapus' ? '…' : 'Hapus'}
                      </button>
                      <button
                        onClick={() => setKonfirmasiHapus(null)}
                        style={{ flexShrink: 0, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 12, color: '#7a766f', cursor: 'pointer' }}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1b1a17' }}>{p.nama}</div>
                        {manual && (
                          <div style={{ fontSize: 10, color: '#a8a39a', marginTop: 1 }}>ditambahkan sendiri</div>
                        )}
                      </div>
                      {!coba && (
                        <button
                          onClick={() => { setUbahId(p.id); setUbahNama(p.nama); setKonfirmasiHapus(null); }}
                          style={{ flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: '#44423d', cursor: 'pointer' }}
                        >
                          Ubah
                        </button>
                      )}
                      {manual && !coba && (
                        <button
                          onClick={() => { setKonfirmasiHapus(p.id); setUbahId(null); }}
                          style={{ flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid oklch(0.85 0.08 25)', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'oklch(0.46 0.14 25)', cursor: 'pointer' }}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {jumlahManual > 0 && (
          <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 8 }}>
            {jumlahManual} peserta ditambahkan sendiri. Agar tercatat di semua modul, mintakan juga
            pendaftarannya ke koordinator.
          </div>
        )}
      </div>
      <div style={{ height: 28 }} />
    </>
  );
}
