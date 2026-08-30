'use client';

import { useState } from 'react';
import {
  batalkanUsulan,
  jalankanAlokasiSekarang,
  putuskanSanggahan,
  sapuKedaluwarsa,
  setujuiUsulan,
  ubahStatusVerifikasi,
} from './actions';
import { Bagian, useAksi } from './ui';

export interface BarisAntrean {
  id: string;
  pengajar: string;
  slot: string;
  status: string;
  sanggahan_status: string | null;
  bentrok_alasan: string | null;
  catatan: string | null;
}

export interface KartuUsulan {
  id: string;
  status: string;
  slot: string;
  pengajar: string;
  level: string;
  pita: string;
  putaran: number;
  peserta: number;
  terenrol: number;
  tanggal_mulai: string | null;
  tenggat: string | null;
  tilawah_halaqah_id: number | null;
  grup_wa_link: string | null;
}

interface Props {
  periodeId: string;
  antrean: BarisAntrean[];
  usulan: KartuUsulan[];
  preset: { id: string; nama: string; gender: string; tipe: string }[];
}

export function PanelKerja({ periodeId, antrean, usulan, preset }: Props) {
  return (
    <>
      <Alokasi periodeId={periodeId} preset={preset} />
      <PapanUsulan usulan={usulan} />
      <Antrean baris={antrean} />
    </>
  );
}

function Alokasi({ periodeId, preset }: { periodeId: string; preset: Props['preset'] }) {
  const { pending, jalan, tampilan } = useAksi();
  const [ikhwan, setIkhwan] = useState('');
  const [akhwat, setAkhwat] = useState('');

  const opsi = (gender: string) => preset.filter((p) => p.gender === gender);

  return (
    <Bagian
      judul="Jalankan alokasi"
      keterangan="Membentuk usulan halaqah dari antrean pendaftar dan pengajar yang tersedia. Berputar: tidak ada pengajar mendapat halaqah kedua sebelum semua yang bersedia mendapat yang pertama. Hasilnya usulan — belum halaqah."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Prioritas ikhwan</span>
          <select className="input" value={ikhwan} onChange={(e) => setIkhwan(e.target.value)}>
            <option value="">Urutan waktu pengisian form</option>
            {opsi('ikhwan').map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.tipe})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Prioritas akhwat</span>
          <select className="input" value={akhwat} onChange={(e) => setAkhwat(e.target.value)}>
            <option value="">Urutan waktu pengisian form</option>
            {opsi('akhwat').map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.tipe})
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            jalan(() =>
              jalankanAlokasiSekarang({
                periodeId,
                presetIkhwanId: ikhwan || null,
                presetAkhwatId: akhwat || null,
              })
            )
          }
        >
          {pending ? 'Menjalankan…' : 'Jalankan alokasi'}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending}
          onClick={() => jalan(() => sapuKedaluwarsa({ periodeId }))}
        >
          Sapu yang lewat tenggat
        </button>
      </div>
      {tampilan}
    </Bagian>
  );
}

function PapanUsulan({ usulan }: { usulan: KartuUsulan[] }) {
  const { pending, jalan, tampilan } = useAksi();
  const [waUrl, setWaUrl] = useState<string | null>(null);

  const perStatus = new Map<string, KartuUsulan[]>();
  for (const u of usulan) {
    if (!perStatus.has(u.status)) perStatus.set(u.status, []);
    perStatus.get(u.status)!.push(u);
  }
  const urutStatus = ['usulan', 'menunggu', 'dikonfirmasi', 'dikirim', 'kedaluwarsa', 'gagal', 'disetujui'];

  return (
    <Bagian
      judul="Papan usulan & konfirmasi"
      keterangan="Setujui usulan untuk menerbitkan tautan konfirmasi pengajar. Tautan dikirim lewat WhatsApp oleh Anda — maahir tidak memiliki gateway pengirim."
    >
      {usulan.length === 0 && (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Belum ada usulan. Jalankan alokasi setelah pendaftar dan ketersediaan masuk.
        </p>
      )}
      {tampilan}
      {waUrl && (
        <p className="t-small" style={{ marginBottom: 10 }}>
          <a className="btn btn-sm" href={waUrl} target="_blank" rel="noopener noreferrer">
            Buka WhatsApp untuk mengirim tautan konfirmasi
          </a>
        </p>
      )}

      {urutStatus
        .filter((s) => perStatus.has(s))
        .map((s) => (
          <div key={s} style={{ marginBottom: 14 }}>
            <h3 className="t-small" style={{ fontWeight: 700, marginBottom: 6 }}>
              {labelStatus(s)} ({perStatus.get(s)!.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {perStatus.get(s)!.map((u) => (
                <div key={u.id} className="card-flat" style={{ padding: '8px 10px' }}>
                  <div className="t-small">
                    <strong>{u.slot}</strong> · {u.pengajar} · {u.level} · {u.pita} ·{' '}
                    {u.peserta} murid · putaran {u.putaran}
                  </div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {u.tanggal_mulai ? `Mulai ${u.tanggal_mulai}` : 'Tanggal mulai belum ditetapkan'}
                    {u.tenggat && s === 'menunggu'
                      ? ` · tenggat ${new Date(u.tenggat).toLocaleString('id-ID')}`
                      : ''}
                    {u.tilawah_halaqah_id ? ` · tilawah #${u.tilawah_halaqah_id}` : ''}
                    {u.terenrol > 0 ? ` · ${u.terenrol}/${u.peserta} terenrol` : ''}
                    {u.grup_wa_link ? ' · grup siap' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {(s === 'usulan' || s === 'disetujui') && (
                      <button
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() =>
                          jalan(
                            () => setujuiUsulan({ usulanId: u.id }),
                            (data) => {
                              const d = data as { waUrl?: string } | undefined;
                              if (d?.waUrl) setWaUrl(d.waUrl);
                            }
                          )
                        }
                      >
                        Deklarasikan penuh
                      </button>
                    )}
                    {s !== 'dikirim' && <TombolBatal usulanId={u.id} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </Bagian>
  );
}

function TombolBatal({ usulanId }: { usulanId: string }) {
  const { pending, jalan, tampilan } = useAksi();
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState('');

  if (!buka) {
    return (
      <button className="btn btn-sm btn-ghost" onClick={() => setBuka(true)}>
        Batalkan
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <input
        className="input"
        value={alasan}
        onChange={(e) => setAlasan(e.target.value)}
        placeholder="Alasan pembatalan (wajib — masuk log perubahan)"
      />
      {tampilan}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => jalan(() => batalkanUsulan({ usulanId, alasan }))}
        >
          Konfirmasi batal
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setBuka(false)}>
          Tutup
        </button>
      </div>
      <span className="t-small" style={{ color: 'var(--muted-2)' }}>
        Peserta dikembalikan ke antrean, tidak dibuang.
      </span>
    </div>
  );
}

function Antrean({ baris }: { baris: BarisAntrean[] }) {
  return (
    <Bagian
      judul="Antrean kerja"
      keterangan="Baris yang perlu diputuskan: sanggahan slot terkunci, dan isian yang gagal salah satu butir verifikasi."
    >
      {baris.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada yang menunggu keputusan.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {baris.map((b) => (
            <KartuAntrean key={b.id} baris={b} />
          ))}
        </div>
      )}
    </Bagian>
  );
}

function KartuAntrean({ baris }: { baris: BarisAntrean }) {
  const { pending, jalan, tampilan } = useAksi();
  const [catatan, setCatatan] = useState('');
  const sanggahan = baris.sanggahan_status === 'menunggu';

  return (
    <div className="card-flat" style={{ padding: '8px 10px' }}>
      <div className="t-small">
        <strong>{baris.pengajar}</strong> · {baris.slot}
      </div>
      <div className="t-small" style={{ color: 'var(--muted-2)' }}>
        {sanggahan
          ? `Sanggahan slot terkunci: ${baris.bentrok_alasan ?? '—'}`
          : `Status: ${baris.status}${baris.catatan ? ` · ${baris.catatan}` : ''}`}
      </div>
      <input
        className="input"
        style={{ marginTop: 6, width: '100%' }}
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        placeholder={sanggahan ? 'Catatan keputusan (opsional)' : 'Catatan / alasan'}
      />
      {tampilan}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {sanggahan ? (
          <>
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() =>
                jalan(() => putuskanSanggahan({ ketersediaanId: baris.id, terima: true, catatan }))
              }
            >
              Terima — buka kunci
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={pending}
              onClick={() =>
                jalan(() => putuskanSanggahan({ ketersediaanId: baris.id, terima: false, catatan }))
              }
            >
              Tolak — tetap terkunci
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() =>
                jalan(() =>
                  ubahStatusVerifikasi({ ketersediaanId: baris.id, status: 'terverifikasi', catatan })
                )
              }
            >
              Verifikasi
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={pending}
              onClick={() =>
                jalan(() =>
                  ubahStatusVerifikasi({ ketersediaanId: baris.id, status: 'ditolak', catatan })
                )
              }
            >
              Tolak
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function labelStatus(s: string): string {
  const peta: Record<string, string> = {
    usulan: 'Menunggu persetujuan koordinator',
    disetujui: 'Disetujui, belum dikirimi tautan',
    menunggu: 'Menunggu konfirmasi pengajar',
    dikonfirmasi: 'Dikonfirmasi pengajar',
    dikirim: 'Terkirim ke CMS tilawah',
    kedaluwarsa: 'Lewat tenggat',
    gagal: 'Gagal dikirim',
  };
  return peta[s] ?? s;
}
