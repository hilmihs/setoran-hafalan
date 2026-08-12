'use client';

import { useState, useTransition } from 'react';
import { kirimShakwa, type KirimShakwaResult } from './actions';
import {
  KATEGORI,
  HALAQAH_OPTIONS,
  IZIN_JENIS,
  MAX_LAMPIRAN,
  kategoriDef,
  type ShakwaIzinJenis,
} from '@/lib/shakwa';

export type HalaqahPengajar = { id: string; name: string };

type RincianRow = {
  tanggal: string;
  jenis: ShakwaIzinJenis | '';
  menit: string;
  jadwalGanti: string;
  halaqahId: string;
};

const barisKosong: RincianRow = { tanggal: '', jenis: '', menit: '', jadwalGanti: '', halaqahId: '' };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 6,
};

export function ShakwaForm({
  prefillNama,
  prefillGender,
  isPengajar,
  halaqahPengajar,
}: {
  prefillNama: string;
  prefillGender: string;
  isPengajar: boolean;
  halaqahPengajar: HalaqahPengajar[];
}) {
  const [kategori, setKategori] = useState('');
  const [rincian, setRincian] = useState<RincianRow[]>([{ ...barisKosong }]);
  const [hasil, setHasil] = useState<KirimShakwaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const def = kategori ? kategoriDef(kategori) : null;
  const terkunci = !!def?.butuhLogin && !isPengajar;

  function ubahRincian(idx: number, patch: Partial<RincianRow>) {
    setRincian((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await kirimShakwa(undefined, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setHasil(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (hasil?.ok) {
    return (
      <div className="card-flat" style={{ padding: '20px 22px' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
          Jazakumullahu khairan — laporan Anda tersimpan.
        </div>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
          Nomor tiket <strong className="t-mono">{hasil.nomorTiket}</strong>. Simpan nomor ini untuk
          menanyakan tindak lanjutnya.
        </p>
        {hasil.waUrl ? (
          <>
            <a
              href={hasil.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Kirim ke {hasil.tujuanNama ?? 'penanggung jawab'} via WhatsApp
            </a>
            <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
              Pesannya sudah disiapkan; Anda tinggal menekan kirim di WhatsApp.
            </p>
          </>
        ) : (
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>
            Laporan ini masuk ke rekap harian koordinator — tak perlu dikirim lewat WhatsApp.
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setHasil(null);
              setKategori('');
              setRincian([{ ...barisKosong }]);
            }}
          >
            Kirim laporan lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="card-flat" style={{ padding: '18px 20px' }}>
      {/* Honeypot: disembunyikan dari manusia, diisi bot. */}
      <input
        type="text"
        name="alamat"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
      />

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-gender">
          Gender <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <select
          id="shakwa-gender"
          name="gender"
          required
          defaultValue={prefillGender}
          className="input"
          style={{ width: '100%' }}
        >
          <option value="">— pilih —</option>
          <option value="akhwat">AKHWAT</option>
          <option value="ikhwan">IKHWAN</option>
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-nama">
          Nama Lengkap <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <input
          id="shakwa-nama"
          name="nama"
          required
          defaultValue={prefillNama}
          className="input"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-wa">
          Nomor WhatsApp
        </label>
        <input
          id="shakwa-wa"
          name="pelapor_wa"
          inputMode="tel"
          placeholder="08xxxxxxxxxx — agar koordinator bisa membalas"
          className="input"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-kategori">
          Laporan Terkait <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <select
          id="shakwa-kategori"
          name="kategori"
          required
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          className="input"
          style={{ width: '100%' }}
        >
          <option value="">— pilih kategori —</option>
          {KATEGORI.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
              {k.butuhLogin ? ' (perlu masuk sebagai pengajar)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle} htmlFor="shakwa-halaqah">
          Halaqoh <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <select id="shakwa-halaqah" name="halaqah_label" required className="input" style={{ width: '100%' }}>
          <option value="">— pilih —</option>
          {HALAQAH_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      {terkunci && def && (
        <div
          className="card-flat"
          style={{ padding: '14px 16px', borderLeft: '3px solid var(--kuning)', marginBottom: 16 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Kategori {def.label} perlu masuk dulu</div>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
            Laporan ini menyangkut data pengajar, jadi identitas pengirimnya harus pasti.
          </p>
          <a href="/?next=/shakwa" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Masuk sebagai pengajar
          </a>
        </div>
      )}

      {def && !terkunci && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{def.judulBlok}</div>
          <p
            className="t-small"
            style={{ color: 'var(--muted-2)', whiteSpace: 'pre-line', marginBottom: 14 }}
          >
            {def.hintFormat}
          </p>

          {def.fieldTambahan.map((f) => (
            <div key={f.name} style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor={`tambahan-${f.name}`}>
                {f.label} <span style={{ color: 'var(--merah-ink)' }}>*</span>
              </label>
              <select
                id={`tambahan-${f.name}`}
                name={`tambahan_${f.name}`}
                required
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">— pilih —</option>
                {f.opsi.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="shakwa-isi">
              {def.labelIsi} <span style={{ color: 'var(--merah-ink)' }}>*</span>
            </label>
            <textarea
              id="shakwa-isi"
              name="isi"
              required
              rows={6}
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          {def.value === 'izin' && (
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                Rincian izin <span style={{ color: 'var(--merah-ink)' }}>*</span>
              </div>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
                Rincian ini yang membuat Anda tak perlu tabayyun lagi saat ketua kelas mengisi
                observasi hari itu.
              </p>
              {rincian.map((r, idx) => {
                const jenisDef = IZIN_JENIS.find((j) => j.value === r.jenis);
                return (
                  <div
                    key={idx}
                    className="card-flat"
                    style={{ padding: '12px 14px', marginBottom: 8, background: 'var(--surface-2)' }}
                  >
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-tanggal-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          Tanggal
                        </label>
                        <input
                          id={`izin-tanggal-${idx}`}
                          type="date"
                          name="izin_tanggal"
                          value={r.tanggal}
                          onChange={(e) => ubahRincian(idx, { tanggal: e.target.value })}
                          className="input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-jenis-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          Jenis
                        </label>
                        <select
                          id={`izin-jenis-${idx}`}
                          name="izin_jenis"
                          value={r.jenis}
                          onChange={(e) => ubahRincian(idx, { jenis: e.target.value as ShakwaIzinJenis })}
                          className="input"
                          style={{ width: '100%' }}
                        >
                          <option value="">— pilih —</option>
                          {IZIN_JENIS.map((j) => (
                            <option key={j.value} value={j.value}>
                              {j.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-halaqah-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          Halaqah
                        </label>
                        <select
                          id={`izin-halaqah-${idx}`}
                          name="izin_halaqah"
                          value={r.halaqahId}
                          onChange={(e) => ubahRincian(idx, { halaqahId: e.target.value })}
                          className="input"
                          style={{ width: '100%' }}
                        >
                          <option value="">Semua halaqah saya</option>
                          {halaqahPengajar.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-menit-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          {jenisDef?.butuhTanggalGanti ? 'Tanggal ganti' : 'Jumlah menit'}
                        </label>
                        {jenisDef?.butuhTanggalGanti ? (
                          <input
                            id={`izin-menit-${idx}`}
                            type="date"
                            name="izin_jadwal_ganti"
                            value={r.jadwalGanti}
                            onChange={(e) => ubahRincian(idx, { jadwalGanti: e.target.value })}
                            className="input"
                            style={{ width: '100%' }}
                          />
                        ) : (
                          <input
                            id={`izin-menit-${idx}`}
                            type="number"
                            min={0}
                            name="izin_menit"
                            value={r.menit}
                            // readOnly, bukan disabled: field disabled tak ikut terkirim
                            // dan akan menggeser pasangan array rincian di server.
                            readOnly={!jenisDef?.butuhMenit}
                            placeholder={jenisDef?.butuhMenit ? 'mis. 15' : '—'}
                            onChange={(e) => ubahRincian(idx, { menit: e.target.value })}
                            className="input"
                            style={{ width: '100%' }}
                          />
                        )}
                      </div>
                    </div>
                    {/* Field sejajar per indeks: yang tak dipakai tetap dikirim kosong
                        supaya urutan baris di server tak bergeser. */}
                    {!jenisDef?.butuhTanggalGanti && <input type="hidden" name="izin_jadwal_ganti" value="" />}
                    {jenisDef?.butuhTanggalGanti && <input type="hidden" name="izin_menit" value="" />}
                    {rincian.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ marginTop: 8 }}
                        onClick={() => setRincian((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        Hapus baris
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setRincian((rows) => [...rows, { ...barisKosong }])}
              >
                + Tambah rincian
              </button>
            </div>
          )}

          {def.pakaiLampiran && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor="shakwa-lampiran">
                Foto / bukti (opsional)
              </label>
              <input
                id="shakwa-lampiran"
                type="file"
                name="lampiran"
                multiple
                accept="image/*,application/pdf"
                className="input"
                style={{ width: '100%' }}
              />
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                Maksimal {MAX_LAMPIRAN} berkas, 5 MB per berkas (JPG/PNG/WEBP/PDF).
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 10 }}>
          {error}
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending || !def || terkunci}>
        {pending ? 'Mengirim…' : 'Kirim Laporan'}
      </button>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 10 }}>
        Semoga Allah mudahkan.
      </p>
    </form>
  );
}
