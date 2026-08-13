'use client';

import { Fragment, useState } from 'react';
import type { RekapKelas, StatusCode } from '@/lib/maahir-rekap';
import { CODE_COLOR, persenBadgeClass } from '@/lib/status-color';

function Chip({ code }: { code: StatusCode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        padding: '0 5px',
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        color: code === '-' ? 'var(--muted-2)' : '#fff',
        background: code === '-' ? 'var(--surface-2)' : CODE_COLOR[code],
      }}
    >
      {code}
    </span>
  );
}

function tanggalShort(t: string): string {
  return new Date(t + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

const PROGRAM_SHORT: Record<string, string> = {
  kelas_maahir: 'Maahir',
  at_tibyan: 'Tibyan',
  muallim_najih: 'Najih',
};

const KODE_LABEL: Record<StatusCode, string> = {
  H: 'Hadir',
  I: 'Izin',
  S: 'Sakit',
  A: 'Alpa',
  T: 'Terlambat',
  '-': 'Tak tercatat',
};

/**
 * Alasan yang ditulis ketua kelas saat presensi, per tanggal.
 *
 * Koordinator menanyakan "kenapa izin", jadi yang berguna adalah alasan yang
 * melekat pada tanggalnya — bukan gabungan semua catatan sebulan. Sesi tanpa
 * catatan sengaja tetap disebut bila statusnya izin/alpa, supaya yang tak
 * beralasan justru menonjol.
 */
function KeteranganList({
  anggota,
  pertemuan,
}: {
  anggota: RekapKelas['anggota'][number];
  pertemuan: RekapKelas['pertemuan'];
}) {
  const baris = pertemuan
    .map((p) => ({
      p,
      code: anggota.perPertemuan[p.id] ?? '-',
      catatan: anggota.catatanPerPertemuan?.[p.id] ?? '',
    }))
    .filter((x) => x.catatan || x.code === 'I' || x.code === 'A');

  if (baris.length === 0) return null;

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <div className="t-tiny" style={{ color: 'var(--muted-2)', fontWeight: 600, marginBottom: 4 }}>
        KETERANGAN
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {baris.map((x) => (
          <div key={x.p.id} className="t-tiny" style={{ display: 'flex', gap: 6 }}>
            <span style={{ minWidth: 96, color: 'var(--muted-2)', flexShrink: 0 }}>
              {tanggalShort(x.p.tanggal)} · {PROGRAM_SHORT[x.p.program] ?? x.p.program}
            </span>
            <span
              style={{
                minWidth: 62,
                flexShrink: 0,
                fontWeight: 600,
                color: x.code === '-' ? 'var(--muted-2)' : CODE_COLOR[x.code],
              }}
            >
              {KODE_LABEL[x.code]}
            </span>
            <span style={{ color: x.catatan ? 'var(--ink)' : 'var(--muted-2)' }}>
              {x.catatan || '(tanpa keterangan)'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Tally = { H: number; I: number; S: number; A: number; T: number; nilai: number };

/**
 * Pecahan per program untuk satu anggota — supaya angka gabungan di kolom
 * %Hadir bisa dicocokkan dengan Laporan Bulanan yang memisah Maahir/At-Tibyan.
 * Penyebut = sesi yang tercatat statusnya, dikurangi sakit (sakit = udzur).
 */
function perProgram(
  pertemuan: RekapKelas['pertemuan'],
  perPertemuan: Record<string, StatusCode>
): Array<{ program: string; tally: Tally; persen: number | null }> {
  const map = new Map<string, Tally>();
  for (const p of pertemuan) {
    const code = perPertemuan[p.id] ?? '-';
    if (code === '-') continue; // tak tercatat / di luar rentang keanggotaan
    let t = map.get(p.program);
    if (!t) {
      t = { H: 0, I: 0, S: 0, A: 0, T: 0, nilai: 0 };
      map.set(p.program, t);
    }
    t[code]++;
    if (code !== 'S') t.nilai++;
  }
  return [...map.entries()].map(([program, tally]) => ({
    program,
    tally,
    persen:
      tally.nilai > 0
        ? Math.round(((tally.H + tally.T) / tally.nilai) * 100)
        : tally.S > 0
          ? 100
          : null,
  }));
}

export function MaahirRekapTable({ kelas }: { kelas: RekapKelas }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (kelas.anggota.length === 0) {
    return (
      <p className="t-small" style={{ color: 'var(--muted-2)' }}>
        Belum ada anggota.
      </p>
    );
  }

  const noData = kelas.pertemuan.length === 0;

  return (
    <div>
      {noData && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
          Belum ada presensi yang terisi bulan ini.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Anggota</th>
              <th>H</th>
              <th>I</th>
              <th>S</th>
              <th>A</th>
              <th>T</th>
              <th>%Hadir</th>
            </tr>
          </thead>
          <tbody>
            {kelas.anggota.map((a) => {
              const isOpen = expanded === a.anggotaId;
              return (
                <Fragment key={a.anggotaId}>
                  <tr
                    onClick={() =>
                      setExpanded(isOpen ? null : a.anggotaId)
                    }
                    style={{ cursor: noData ? 'default' : 'pointer' }}
                  >
                    <td style={{ textAlign: 'left' }}>
                      {!noData && (
                        <span style={{ color: 'var(--muted-2)', marginRight: 6 }}>
                          {isOpen ? '▾' : '▸'}
                        </span>
                      )}
                      {a.name}
                      {a.isKetua && (
                        <span className="t-tiny" style={{ color: 'var(--accent-2)' }}>
                          {' '}· Ketua
                        </span>
                      )}
                      {a.isWakil && (
                        <span className="t-tiny" style={{ color: 'var(--accent-2)' }}>
                          {' '}· Wakil
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>{a.totals.H || ''}</td>
                    <td style={{ textAlign: 'center' }}>{a.totals.I || ''}</td>
                    <td style={{ textAlign: 'center' }}>{a.totals.S || ''}</td>
                    <td style={{ textAlign: 'center' }}>{a.totals.A || ''}</td>
                    <td style={{ textAlign: 'center' }}>{a.totals.T || ''}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={persenBadgeClass(a.persenHadir)}>
                        {a.persenHadir === null ? '–' : `${a.persenHadir}%`}
                      </span>
                    </td>
                  </tr>
                  {isOpen && !noData && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--surface-2)', padding: 10 }}>
                        {/* Pecahan per program — jembatan ke Laporan Bulanan. */}
                        <div
                          className="t-tiny"
                          style={{
                            color: 'var(--muted-2)',
                            marginBottom: 8,
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 10,
                          }}
                        >
                          {perProgram(kelas.pertemuan, a.perPertemuan).map((g) => (
                            <span key={g.program}>
                              <strong>{PROGRAM_SHORT[g.program] ?? g.program}</strong>:{' '}
                              {g.persen === null ? '–' : `${g.persen}%`}{' '}
                              ({g.tally.H + g.tally.T}/{g.tally.nilai}
                              {g.tally.S > 0 ? ` · ${g.tally.S} sakit dikecualikan` : ''})
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {kelas.pertemuan.map((p) => {
                            const catatan = a.catatanPerPertemuan?.[p.id];
                            return (
                              <div
                                key={p.id}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 3,
                                  minWidth: 48,
                                }}
                                title={
                                  `${p.programLabel} · ${tanggalShort(p.tanggal)}` +
                                  (catatan ? `\n${catatan}` : '')
                                }
                              >
                                <Chip code={a.perPertemuan[p.id] ?? '-'} />
                                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                                  {tanggalShort(p.tanggal)}
                                </span>
                                <span
                                  className="t-tiny"
                                  style={{ color: 'var(--muted-2)', fontSize: 9 }}
                                >
                                  {p.program === 'kelas_maahir' ? 'Maahir' : (p.program as string) === 'muallim_najih' ? 'Najih' : 'Tibyan'}
                                </span>
                                {/* Penanda bahwa sesi ini punya alasan tertulis —
                                    teksnya sendiri ada di daftar bawah, di sini
                                    tak muat tanpa merusak barisan chip. */}
                                {catatan && (
                                  <span
                                    className="t-tiny"
                                    style={{ color: 'var(--kuning-ink)', fontSize: 9, lineHeight: 1 }}
                                  >
                                    ✎
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <KeteranganList anggota={a} pertemuan={kelas.pertemuan} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 8, lineHeight: 1.6 }}>
        H = Hadir · I = Izin · S = Sakit · A = Alpa · T = Terlambat
        <br />
        Tap nama peserta untuk membuka rinciannya. Tanda <strong>✎</strong> di bawah chip = sesi itu
        punya keterangan; teks lengkapnya ada di blok <strong>KETERANGAN</strong>, beserta sesi
        izin/alpa yang ketuanya tak menuliskan alasan.
        <br />
        %Hadir = (H+T) / (jml pertemuan − sakit). <strong>Sakit tidak menurunkan persen</strong>{' '}
        (dianggap udzur, sesinya dikeluarkan dari penyebut); izin dan alpa tetap menurunkan.
        <br />
        Persen di kolom ini <strong>menggabung sesi Maahir + At-Tibyan</strong> dalam bulan
        kalender. Laporan Bulanan memisah keduanya dan memakai periode 28–27, jadi angkanya
        wajar berbeda — tap nama anggota untuk melihat pecahan per program.
      </div>
    </div>
  );
}
