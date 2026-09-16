import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { bolehLihatFiturTersembunyi, isSuperadmin } from '@/lib/admin-guard';
import { listPeriode, listSlot } from '@/lib/ketersediaan-periode';
import { ringkasSlot } from '@/lib/ketersediaan-permintaan';
import { listPreset } from '@/lib/ketersediaan-prioritas';
import { ringkasDitahan } from '@/lib/ketersediaan-ditahan';
import {
  jumlahkan,
  susunArus,
  susunBarisJam,
  susunPeta,
  tanggalBatasAntrean,
  type BarisJam,
} from '@/lib/ketersediaan-dasbor';
import type { Gender } from '@/types/db';
import { PanelPeriode, PeriodeBaru } from './PanelPeriode';
import { PanelSlot } from './PanelSlot';
import { PanelKerja } from './PanelKerja';
import { PanelPendaftar } from './PanelPendaftar';
import { PanelPengingat } from './PanelPengingat';
import { PanelGrupPool } from './PanelGrupPool';
import { PanelDitahan } from './PanelDitahan';
import { PanelImpor } from './PanelImpor';
import {
  hitungPengajarTersedia,
  muatAntrean,
  muatGrupPool,
  muatPendaftarRingkas,
  muatPengajarDasbor,
  muatSumber,
  muatTugas,
  muatUsulan,
  type TugasGender,
} from './data';
import { bacaGender, bacaTab, tautanDasbor, type TabDasbor } from './dasbor/navigasi';
import { KepalaDasbor } from './dasbor/KepalaDasbor';
import { TabRingkasan, type ButirTugas } from './dasbor/TabRingkasan';
import { TabJam } from './dasbor/TabJam';
import { DaftarPengajar } from './dasbor/DaftarPengajar';
import { ArusPendaftarChart } from './dasbor/ArusPendaftarChart';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('id-ID');

export default async function KetersediaanKoordinatorPage({
  searchParams,
}: {
  searchParams: { periode?: string; tab?: string; g?: string };
}) {
  const sesi = await requireOneOfRoles(['koordinator']);
  // Masih disembunyikan: hanya superadmin (dan sesi login-sebagai oleh superadmin).
  if (!(await bolehLihatFiturTersembunyi())) notFound();

  const superadmin = await isSuperadmin();
  const sekarang = new Date();
  const semuaPeriode = await listPeriode();
  const tab = bacaTab(searchParams.tab);
  const g = bacaGender(searchParams.g, superadmin ? 'semua' : sesi.gender);

  const periode =
    semuaPeriode.find((p) => p.id === searchParams.periode) ??
    semuaPeriode.find((p) => p.aktif) ??
    semuaPeriode[0] ??
    null;

  if (!periode) {
    return (
      <Bingkai>
        <Kop />
        <FeatureNav current="/ketersediaan/koordinator" />
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Kelola Ketersediaan Mengajar</h1>
        <p className="t-small" style={{ color: 'var(--muted)', marginBottom: 16 }}>
          Belum ada periode. Buat satu periode per batch KBM — misalnya Batch September 2026 dan Batch Oktober 2026 —
          lalu impor ketersediaan pengajar dari xlsx di tab Pengaturan.
        </p>
        <PeriodeBaru />
      </Bingkai>
    );
  }

  const slots = await listSlot(periode.id);
  const slotAktif = slots.filter((s) => s.aktif);
  const [ringkas, pengajarSemua, tugas, pendaftarSemua] = await Promise.all([
    ringkasSlot(periode, slotAktif, sekarang),
    muatPengajarDasbor(periode.id),
    muatTugas(periode.id, sekarang),
    muatPendaftarRingkas(periode.id),
  ]);

  const saring = <T,>(xs: readonly T[], genderDari: (x: T) => Gender | null): T[] =>
    g === 'semua' ? [...xs] : xs.filter((x) => genderDari(x) === g);

  const jamSemua = susunBarisJam(slotAktif, ringkas, periode.kapasitas_halaqah);
  const jam = saring(jamSemua, (b) => b.kelompok);
  const pengajar = saring(pengajarSemua, (p) => p.gender);
  const pendaftar = saring(pendaftarSemua, (p) => p.gender);

  // Pendaftar ditahan dihitung dari barisnya, bukan per jam: sebagian besar
  // tertahan justru karena jamnya tidak terbaca, jadi tak punya slot.
  const tertahanUntuk = (gender?: Gender) =>
    pendaftarSemua.filter((p) => p.status === 'ditahan' && (!gender || p.gender === gender)).length;
  const angkaUntuk = (baris: readonly BarisJam[], gender?: Gender) => ({
    ...jumlahkan(baris),
    tertahan: tertahanUntuk(gender),
    pengajar: hitungPengajarTersedia(pengajarSemua, gender),
  });
  const angka = angkaUntuk(jam, g === 'semua' ? undefined : g);
  const pecah =
    g === 'semua'
      ? {
          ikhwan: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'ikhwan'), 'ikhwan'),
          akhwat: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'akhwat'), 'akhwat'),
        }
      : null;

  const tugasG: TugasGender =
    g === 'semua'
      ? {
          usulanMenunggu: tugas.ikhwan.usulanMenunggu + tugas.akhwat.usulanMenunggu,
          tenggatLewat: tugas.ikhwan.tenggatLewat + tugas.akhwat.tenggatLewat,
          sanggahan: tugas.ikhwan.sanggahan + tugas.akhwat.sanggahan,
        }
      : tugas[g];

  const href = (t: TabDasbor) => tautanDasbor({ periode: periode.id, tab: t, g });
  const tanpaPengajar = jam.filter((b) => b.status === 'tanpa_pengajar');
  const kurangPengajar = jam.filter((b) => b.status === 'kurang');

  const butir: ButirTugas[] = [];
  if (slotAktif.length === 0) {
    butir.push({
      nada: 'aksen',
      judul: 'Periode ini belum punya jam',
      desk: 'Impor ketersediaan pengajar dari xlsx untuk mengisi master jam.',
      href: href('pengaturan'),
      label: 'Buka impor',
    });
  }
  if (tanpaPengajar.length > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tanpaPengajar.length} jam tanpa pengajar sama sekali`,
      desk: `${fmt(tanpaPengajar.reduce((a, b) => a + b.antre, 0))} pendaftar menunggu di jam itu dan belum bisa dibentuk halaqahnya.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }
  if (tugasG.tenggatLewat > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tugasG.tenggatLewat} konfirmasi pengajar lewat tenggat`,
      desk: 'Belum digeser ke pengajar berikutnya. Jalankan "Sapu yang lewat tenggat".',
      href: href('usulan'),
      label: 'Buka usulan',
    });
  }
  if (tugasG.usulanMenunggu > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${tugasG.usulanMenunggu} usulan halaqah menunggu dilepas`,
      desk: 'Pengajar belum dihubungi sampai usulannya dilepas.',
      href: href('usulan'),
      label: 'Buka usulan',
    });
  }
  if (angka.tertahan > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${fmt(angka.tertahan)} pendaftar ditahan`,
      desk: 'Tidak ikut dihitung sampai diperiksa: jam tak terbaca, nomor tidak sah, atau umur di luar batas.',
      href: href('pendaftar'),
      label: 'Periksa',
    });
  }
  if (tugasG.sanggahan > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${tugasG.sanggahan} sanggahan jadwal menunggu`,
      desk: 'Pengajar menyatakan jadwal yang mengunci jamnya sudah selesai.',
      href: href('usulan'),
      label: 'Putuskan',
    });
  }
  if (kurangPengajar.length > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${kurangPengajar.length} jam kekurangan pengajar`,
      desk: `${fmt(kurangPengajar.reduce((a, b) => a + b.sisa, 0))} pendaftar belum tertampung walau jamnya punya pengajar.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }

  let isi: ReactNode;
  if (tab === 'ringkasan') {
    isi = (
      <TabRingkasan
        angka={angka}
        pecah={pecah}
        tugas={butir}
        teratas={jam.filter((b) => b.sisa > 0).slice(0, 5)}
        peta={susunPeta(jam)}
        hrefJam={href('jam')}
        tampilGender={g === 'semua'}
      />
    );
  } else if (tab === 'jam') {
    isi = <TabJam baris={jam} tampilGender={g === 'semua'} />;
  } else if (tab === 'pengajar') {
    isi = <DaftarPengajar baris={pengajar} tampilGender={g === 'semua'} />;
  } else if (tab === 'pendaftar') {
    const [ditahan, sumber] = await Promise.all([ringkasDitahan(periode.id), muatSumber(periode.id)]);
    const arus = susunArus(pendaftar);
    isi = (
      <div className="ks-isi">
        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Arus pendaftar</h2>
            <p>{fmt(pendaftar.length)} pendaftar di periode ini</p>
          </div>
          <div className="ks-kartu-isi">
            <ArusPendaftarChart
              data={arus}
              tampil={g === 'semua' ? ['ikhwan', 'akhwat'] : [g]}
              batasAntrean={tanggalBatasAntrean(arus[0]?.tanggal ?? null, periode.usia_antrean_maks_hari)}
            />
          </div>
        </div>
        <PanelDitahan periodeId={periode.id} ringkas={ditahan} />
        <PanelPendaftar periodeId={periode.id} sumber={sumber} />
      </div>
    );
  } else if (tab === 'usulan') {
    const [antrean, usulan, preset, grupPool] = await Promise.all([
      muatAntrean(periode.id),
      muatUsulan(periode.id),
      listPreset(),
      muatGrupPool(periode.id),
    ]);
    isi = (
      <div className="ks-isi">
        <PanelKerja
          periodeId={periode.id}
          antrean={antrean}
          usulan={usulan}
          preset={preset.map((p) => ({ id: p.id, nama: p.nama, gender: p.gender, tipe: p.tipe }))}
        />
        <PanelGrupPool periodeId={periode.id} baris={grupPool} />
        <PanelPengingat periodeId={periode.id} />
      </div>
    );
  } else {
    isi = (
      <div className="ks-isi">
        <PanelImpor />
        <PeriodeBaru />
        <PanelSlot periodeId={periode.id} slots={slots} />
        <PanelPeriode
          periode={periode}
          superadmin={superadmin}
          polaHari={[...new Map(slotAktif.map((s) => [s.hari_idx.join(','), s.hari_idx])).values()].sort((a, b) => a.join().localeCompare(b.join()))}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-sm btn-ghost" href={`/api/ketersediaan/ekspor?periode=${periode.id}`}>
            Unduh xlsx periode ini
          </a>
          <a className="btn btn-sm btn-ghost" href="/ketersediaan/koordinator/tilawah">
            Pemetaan &amp; pengiriman CMS tilawah
          </a>
        </div>
      </div>
    );
  }

  return (
    <Bingkai>
      <Kop />
      <FeatureNav current="/ketersediaan/koordinator" />
      <h1 className="t-h1" style={{ margin: '8px 0 2px' }}>Kelola Ketersediaan Mengajar</h1>
      <p className="t-small" style={{ color: 'var(--muted)', margin: 0 }}>
        Masih tersembunyi — hanya terlihat oleh superadmin. Pengajar belum bisa membuka halamannya.
      </p>
      <KepalaDasbor
        periode={semuaPeriode}
        aktif={periode}
        tab={tab}
        g={g}
        hitungan={{
          jam: tanpaPengajar.length,
          pendaftar: angka.tertahan,
          usulan: tugasG.usulanMenunggu + tugasG.tenggatLewat + tugasG.sanggahan,
        }}
      />
      {isi}
    </Bingkai>
  );
}

function Kop() {
  return (
    <div className="topbar">
      <div className="wordmark">
        <span className="mark">H</span> Ketersediaan Mengajar
      </div>
      <LogoutButton />
    </div>
  );
}

function Bingkai({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>{children}</div>
      </div>
    </main>
  );
}
