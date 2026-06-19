'use client';

import { Fragment, useState } from 'react';
import type { RekapKelas, StatusCode } from '@/lib/maahir-rekap';

const CODE_COLOR: Record<StatusCode, string> = {
  H: 'var(--hijau)',
  T: 'var(--kuning)',
  I: '#64b5f6',
  S: '#ce93d8',
  A: 'var(--merah)',
  '-': 'var(--muted-2)',
};

function persenBadgeClass(p: number | null): string {
  if (p === null) return 'badge';
  if (p >= 80) return 'badge badge-hijau';
  if (p >= 50) return 'badge badge-kuning';
  return 'badge badge-merah';
}

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
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {kelas.pertemuan.map((p) => (
                            <div
                              key={p.id}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 3,
                                minWidth: 48,
                              }}
                              title={`${p.programLabel} · ${tanggalShort(p.tanggal)}`}
                            >
                              <Chip code={a.perPertemuan[p.id] ?? '-'} />
                              <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                                {tanggalShort(p.tanggal)}
                              </span>
                              <span
                                className="t-tiny"
                                style={{ color: 'var(--muted-2)', fontSize: 9 }}
                              >
                                {p.program === 'kelas_maahir'
                                  ? 'Maahir'
                                  : p.program === 'muallim_najih'
                                    ? 'Najih'
                                    : 'Tibyan'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
        H = Hadir · I = Izin · S = Sakit · A = Alpa · T = Terlambat · %Hadir = (H+T)/jml pertemuan
      </div>
    </div>
  );
}
