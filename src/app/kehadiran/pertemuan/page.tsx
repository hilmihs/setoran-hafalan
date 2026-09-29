import type { ReactNode } from 'react';
import { jagaRekapPertemuan } from '@/lib/rekap-pertemuan-akses';
import { getPertemuanMaahir } from '@/lib/rekap-pertemuan-maahir';
import { getPertemuanHilmihsUntuk } from '@/lib/rekap-pertemuan-snapshot';
import {
  gabungProgram,
  geserPeriode,
  hariIniWib,
  hitungRingkasan,
  labelAlasan,
  nadaRingkasan,
  periodePertemuanOptions,
  periodeValid,
  ringkasTotal,
  statusItem,
  type HalaqahPertemuan,
  type PertemuanItem,
  type RingkasanPertemuan,
  type StatusPertemuan,
} from '@/lib/rekap-pertemuan';
import { periodePengajarLabel } from '@/lib/periode-pengajar';
import { tanggalSedang } from '@/lib/tanggal-id';
import { FiturHeader, ChipPeriode } from '@/components/FiturHeader';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { StatCard } from '@/components/ui/StatCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/icons';
import { TombolPerbarui } from './TombolPerbarui';

// Rekap jumlah pertemuan tiap program & halaqah yang diajar pengajar, per
// periode 16–15. Sumber: snapshot Dashboard Edu (disinkron beberapa kali
// sehari, bukan ditarik tiap buka halaman) + check-in Kelas Maahir langsung.
// Identitas (WA/kunci) hanya dipakai di server — tak pernah dirender.

export const dynamic = 'force-dynamic';

const KELAS_NADA: Record<ReturnType<typeof nadaRingkasan>, string> = {
  hijau: 'badge-hijau',
  kuning: 'badge-kuning',
  merah: 'badge-merah',
  netral: 'badge-neutral',
};

const KELAS_STATUS: Record<StatusPertemuan, string> = {
  selesai: 'badge-hijau',
  dikonfirmasi: 'badge-neutral',
  berhalangan: 'badge-kuning',
  terlewat: 'badge-merah',
  akan_datang: 'badge-neutral',
};

function labelStatus(it: PertemuanItem, status: StatusPertemuan): string {
  switch (status) {
    case 'selesai':
      return 'Selesai';
    case 'dikonfirmasi':
      return 'Dikonfirmasi mengajar';
    case 'berhalangan':
      return `Berhalangan (${labelAlasan(it.alasan)})`;
    case 'terlewat':
      return 'Belum diinput';
    case 'akan_datang':
      return 'Akan datang';
  }
}

/** '29 Sep, 11.30 WIB' dari ISO. */
function waktuWib(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${s} WIB`;
}

/** Rincian singkat di bawah nama halaqah: hanya angka yang bukan nol. */
function rincianRingkas(r: RingkasanPertemuan): string {
  const bagian: string[] = [];
  if (r.dikonfirmasiMengajar > 0) bagian.push(`${r.dikonfirmasiMengajar} dikonfirmasi`);
  if (r.berhalangan > 0) bagian.push(`${r.berhalangan} berhalangan`);
  if (r.terlewat > 0) bagian.push(`${r.terlewat} belum diinput`);
  if (r.akanDatang > 0) bagian.push(`${r.akanDatang} akan datang`);
  return bagian.join(' · ');
}

function kunciHalaqah(h: HalaqahPertemuan): string {
  return [h.sumber, h.programKey, h.halaqahNama, h.sebagaiBadal ? 'b' : 'u', h.guruUtama ?? ''].join('|');
}

function Catatan({ children }: { children: ReactNode }) {
  return (
    <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 12, borderRadius: 10 }}>
      <div className="t-small">{children}</div>
    </div>
  );
}

function BarisHalaqah({ h, hariIni }: { h: HalaqahPertemuan; hariIni: string }) {
  const r = hitungRingkasan(h.pertemuan, hariIni);
  const keterangan = [
    h.sebagaiBadal ? `Badal untuk ${h.guruUtama ?? 'pengajar lain'}` : null,
    h.cocokLewat === 'nama' ? 'dicocokkan lewat nama' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const rincian = rincianRingkas(r);

  return (
    <details className="list-details">
      <summary className="list-row" style={{ cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{h.halaqahNama}</div>
          {keterangan && <div className="sub">{keterangan}</div>}
          {rincian && <div className="sub">{rincian}</div>}
        </div>
        <span className={`badge ${KELAS_NADA[nadaRingkasan(r)]}`}>
          {r.selesai}/{r.terjadwal}
        </span>
        <span className="arrow chev">{Icon.arrow(14)}</span>
      </summary>
      {h.pertemuan.length === 0 ? (
        <div className="list-row" style={{ background: 'var(--surface-2)' }}>
          <div className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada pertemuan pada periode ini.</div>
        </div>
      ) : (
        h.pertemuan.map((it) => {
          const st = statusItem(it, hariIni);
          return (
            <div key={it.id} className="list-row" style={{ background: 'var(--surface-2)', padding: '9px 14px' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                {it.urutan != null ? `Pertemuan ke-${it.urutan} · ` : ''}
                {tanggalSedang(it.tanggal)}
              </div>
              <span className={`badge ${KELAS_STATUS[st]}`} style={{ flexShrink: 0 }}>
                {labelStatus(it, st)}
              </span>
            </div>
          );
        })
      )}
      {h.tautan && (
        <a href={h.tautan} className="list-row" style={{ background: 'var(--surface-2)' }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Buka check-in Kelas Maahir</div>
          <span className="arrow">{Icon.arrow(14)}</span>
        </a>
      )}
    </details>
  );
}

export default async function RekapPertemuanPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const id = await jagaRekapPertemuan();
  const hariIni = hariIniWib();
  const month = periodeValid(searchParams.month, hariIni);

  const [h, m] = await Promise.all([
    getPertemuanHilmihsUntuk({ kunciMentah: id.kunciMentah, namaAkun: id.namaAkun }, month),
    getPertemuanMaahir(id.aksesMaahir, month, hariIni),
  ]);
  const programs = gabungProgram([...h.halaqah, ...m.halaqah]);
  const total = ringkasTotal(programs, hariIni);

  const options = periodePertemuanOptions(hariIni);
  const ada = new Set(options.map((o) => o.value));
  const sebelum = geserPeriode(month, -1);
  const sesudah = geserPeriode(month, 1);

  const hilmihsKosong = h.status === 'kosong';
  const adaHalaqahEdu = h.halaqah.length > 0;

  function navPeriode(target: string, label: string, simbol: string) {
    if (!ada.has(target)) {
      return (
        <span className="btn btn-sm btn-ghost" aria-disabled="true" style={{ opacity: 0.4, pointerEvents: 'none' }}>
          {simbol}
        </span>
      );
    }
    return (
      <a href={`?month=${target}`} className="btn btn-sm btn-ghost" aria-label={label}>
        {simbol}
      </a>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <FiturHeader ikon="grafik" judul="Rekap Pertemuan" sub={id.nama} menumpang>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <ChipPeriode>{periodePengajarLabel(month)}</ChipPeriode>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {navPeriode(sebelum, 'Periode sebelumnya', '‹')}
              <div style={{ flex: 1, minWidth: 0 }}>
                <MonthNavSelect options={options} value={month} />
              </div>
              {navPeriode(sesudah, 'Periode berikutnya', '›')}
            </div>
          </div>
        </FiturHeader>

        <div className="page">
          <div className="stat-grid-3 fh-tumpang" style={{ marginBottom: 12 }}>
            <StatCard
              value={`${total.selesai}/${total.jatuhTempo}`}
              label="Terlaksana"
              sub="s/d hari ini"
              valueColor={total.jatuhTempo > 0 ? 'var(--hijau-ink)' : undefined}
            />
            <StatCard
              value={total.terlewat}
              label="Belum diinput"
              valueColor={total.terlewat > 0 ? 'var(--merah-ink)' : undefined}
            />
            <StatCard value={total.terjadwal} label="Terjadwal periode ini" />
          </div>

          {/* Status sumber data */}
          <div className="card-flat" style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>Dashboard Edu</span>
              <span style={{ color: 'var(--muted-2)' }}>
                · {h.syncedAt ? `data per ${waktuWib(h.syncedAt)}` : 'belum pernah disinkron'}
              </span>
              {h.status === 'basi' && <span className="badge badge-kuning">data lama</span>}
            </div>
            {h.gagalTerakhir && (
              <div className="t-tiny" style={{ color: 'var(--kuning-ink)', marginTop: 4 }}>
                Dashboard Edu sedang tidak bisa dihubungi; menampilkan data terakhir.
              </div>
            )}
            {m.aktif && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <span style={{ fontWeight: 600 }}>Kelas Maahir</span>
                <span style={{ color: 'var(--muted-2)' }}> · langsung dari check-in</span>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <TombolPerbarui month={month} />
            </div>
          </div>

          {/* Keadaan kosong / belum cocok */}
          {hilmihsKosong && !m.aktif && (
            <Catatan>
              Data Dashboard Edu belum tersedia. Coba tekan Perbarui beberapa saat lagi.
            </Catatan>
          )}
          {/* Pengajar yang hanya mengampu Kelas Maahir (tanpa akun pengajar HITS) tak
              perlu diberi tahu soal Dashboard Edu. */}
          {!hilmihsKosong && !h.dicocokkan && (id.pengajarId || !m.aktif) && (
            <Catatan>
              Akun Anda belum ditemukan di Dashboard Edu untuk periode ini. Biasanya karena nomor
              WhatsApp di Dashboard Edu berbeda dengan nomor akun Maahir, atau nama tercatat
              berbeda. Mohon hubungi koordinator agar akun Anda dicocokkan.
            </Catatan>
          )}
          {!hilmihsKosong && h.dicocokkan && !adaHalaqahEdu && (
            <Catatan>Tidak ada jadwal halaqah pada periode ini.</Catatan>
          )}
          {m.aktif && m.sebelumAnchor && (
            <Catatan>Check-in Kelas Maahir baru dicatat sejak 16 Sep 2026.</Catatan>
          )}

          {programs.map((p) => {
            const semua = p.halaqah.flatMap((x) => x.pertemuan);
            const r = hitungRingkasan(semua, hariIni);
            return (
              <section key={`${p.sumber}|${p.programKey}`} style={{ marginBottom: 16 }}>
                <SectionHeader title={p.programNama} right={`${r.selesai}/${r.terjadwal}`} as="h2" />
                <div className="card-flat" style={{ overflow: 'hidden' }}>
                  {p.halaqah.map((x) => (
                    <BarisHalaqah key={kunciHalaqah(x)} h={x} hariIni={hariIni} />
                  ))}
                </div>
              </section>
            );
          })}

          <p className="t-small" style={{ color: 'var(--muted)', marginTop: 16, lineHeight: 1.5 }}>
            Periode 16 s/d 15. &ldquo;Terjadwal&rdquo; = jadwal pertemuan yang dibuat di Dashboard
            Edu (atau jadwal Kelas Maahir), bukan target kontrak. &ldquo;Belum diinput&rdquo; =
            jadwal yang sudah lewat tetapi belum ditandai selesai atau dikonfirmasi. Data Dashboard
            Edu diperbarui otomatis beberapa kali sehari.
          </p>
        </div>
      </div>
    </main>
  );
}
