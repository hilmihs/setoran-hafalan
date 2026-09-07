import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { isSuperadmin } from '@/lib/admin-guard';
import { getPeriodeAktif, listPeriode, listSlot } from '@/lib/ketersediaan-periode';
import { ringkasSlot, type RingkasSlot } from '@/lib/ketersediaan-permintaan';
import { listPreset } from '@/lib/ketersediaan-prioritas';
import { PanelPeriode } from './PanelPeriode';
import { PanelSlot } from './PanelSlot';
import { PanelKerja, type BarisAntrean, type KartuUsulan } from './PanelKerja';
import { PanelPendaftar } from './PanelPendaftar';
import { PanelPengingat } from './PanelPengingat';
import { PanelGrupPool, type BarisGrup } from './PanelGrupPool';
import { PanelDitahan } from './PanelDitahan';
import { ringkasDitahan } from '@/lib/ketersediaan-ditahan';
import type { Gender, KsPendaftarSumber, KsSlot } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function KetersediaanKoordinatorPage() {
  await requireOneOfRoles(['koordinator']);
  const superadmin = await isSuperadmin();
  const sekarang = new Date();

  const [periode, semuaPeriode] = await Promise.all([getPeriodeAktif(), listPeriode()]);

  if (!periode) {
    return (
      <Bingkai>
        <Kop />
        <FeatureNav current="/ketersediaan/koordinator" />
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Kelola Ketersediaan Mengajar</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
          Belum ada periode. Buat satu untuk mulai menarik ketersediaan pengajar.
        </p>
        <PanelPeriode periode={null} daftarPeriode={[]} superadmin={superadmin} />
      </Bingkai>
    );
  }

  const slots = await listSlot(periode.id);
  const aktif = slots.filter((s) => s.aktif);
  const ringkas = await ringkasSlot(periode, aktif, sekarang);

  const [antrean, usulan, sumber, preset] = await Promise.all([
    muatAntrean(periode.id),
    muatUsulan(periode.id),
    muatSumber(periode.id),
    listPreset(),
  ]);

  const pengajarRingkas = await muatPengajar(periode.id);
  const grupPool = await muatGrupPool(periode.id);
  const ditahan = await ringkasDitahan(periode.id);

  return (
    <Bingkai>
      <Kop />
      <FeatureNav current="/ketersediaan/koordinator" />

      <h1 className="t-h1" style={{ marginBottom: 4 }}>Kelola Ketersediaan Mengajar</h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        Periode aktif <strong>{periode.nama}</strong> · {periode.mulai} s.d. {periode.selesai} ·{' '}
        {periode.form_tutup ? 'form ditutup terjadwal' : 'form selalu terbuka (bergulir)'} ·{' '}
        kapasitas {periode.kapasitas_halaqah} murid/halaqah
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <a className="btn btn-sm" href={`/api/ketersediaan/ekspor?periode=${periode.id}`}>
          Unduh xlsx
        </a>
        <a className="btn btn-sm btn-ghost" href="/ketersediaan/koordinator/tilawah">
          Pemetaan &amp; pengiriman CMS tilawah
        </a>
      </div>

      <Bagian judul="Pasokan vs permintaan per slot">
        <TabelSlot slots={aktif} ringkas={ringkas} kapasitas={periode.kapasitas_halaqah} />
      </Bagian>

      <Bagian judul="Pengajar: terpenuhi vs belum">
        <TabelPengajar baris={pengajarRingkas} />
      </Bagian>

      <PanelKerja
        periodeId={periode.id}
        antrean={antrean}
        usulan={usulan}
        preset={preset.map((p) => ({ id: p.id, nama: p.nama, gender: p.gender, tipe: p.tipe }))}
      />

      <PanelDitahan periodeId={periode.id} ringkas={ditahan} />

      <PanelPengingat periodeId={periode.id} />

      <PanelGrupPool periodeId={periode.id} baris={grupPool} />

      <PanelPendaftar periodeId={periode.id} sumber={sumber} />

      <PanelSlot periodeId={periode.id} slots={slots} />

      <PanelPeriode
        periode={periode}
        daftarPeriode={semuaPeriode.map((p) => ({ id: p.id, nama: p.nama, aktif: p.aktif }))}
        superadmin={superadmin}
      />
    </Bingkai>
  );
}

// ── Pemuatan data ──────────────────────────────────────────────────────────

async function muatAntrean(periodeId: string): Promise<BarisAntrean[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const namaPengisian = new Map(
    ((pengisian ?? []) as { id: string; pengajar?: { name: string; gender: Gender } | null }[]).map(
      (p) => [p.id, p.pengajar?.name ?? '—']
    )
  );
  if (namaPengisian.size === 0) return [];

  const { data: baris } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id, pengisian_id, status, sanggahan_status, bentrok_alasan, catatan, slot:slot_id(label)')
    .in('status', ['perlu_konfirmasi', 'diajukan']);

  const out: BarisAntrean[] = [];
  for (const b of (baris ?? []) as {
    id: string;
    pengisian_id: string;
    status: string;
    sanggahan_status: string | null;
    bentrok_alasan: string | null;
    catatan: string | null;
    slot?: { label: string } | null;
  }[]) {
    const nama = namaPengisian.get(b.pengisian_id);
    if (!nama) continue;
    // Yang perlu disentuh koordinator: sanggahan menunggu, atau baris yang
    // gagal salah satu butir verifikasi. Baris 'diajukan' yang bersih tidak
    // ditampilkan — menumpuknya hanya membuat antrean terlihat panjang palsu.
    const perluDisentuh = b.sanggahan_status === 'menunggu' || b.status === 'perlu_konfirmasi';
    if (!perluDisentuh) continue;
    out.push({
      id: b.id,
      pengajar: nama,
      slot: b.slot?.label ?? '—',
      status: b.status,
      sanggahan_status: b.sanggahan_status,
      bentrok_alasan: b.bentrok_alasan,
      catatan: b.catatan,
    });
  }
  return out;
}

async function muatUsulan(periodeId: string): Promise<KartuUsulan[]> {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, status, level, pita_umur, pita_digabung, putaran, tanggal_mulai, token_kedaluwarsa, tilawah_halaqah_id, grup_wa_link, slot:slot_id(label), pengajar:pengajar_id(name)'
    )
    .eq('periode_id', periodeId)
    .in('status', ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'kedaluwarsa', 'dikirim', 'gagal'])
    .order('created_at', { ascending: false })
    .limit(200);

  const baris = (data ?? []) as {
    id: string;
    status: string;
    level: string;
    pita_umur: string | null;
    pita_digabung: boolean;
    putaran: number;
    tanggal_mulai: string | null;
    token_kedaluwarsa: string | null;
    tilawah_halaqah_id: number | null;
    grup_wa_link: string | null;
    slot?: { label: string } | null;
    pengajar?: { name: string } | null;
  }[];
  if (baris.length === 0) return [];

  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('usulan_id, status');
  const hitung = new Map<string, number>();
  const terenrol = new Map<string, number>();
  for (const p of (peserta ?? []) as { usulan_id: string; status: string }[]) {
    hitung.set(p.usulan_id, (hitung.get(p.usulan_id) ?? 0) + 1);
    if (p.status === 'terenroll') terenrol.set(p.usulan_id, (terenrol.get(p.usulan_id) ?? 0) + 1);
  }

  return baris.map((b) => ({
    id: b.id,
    status: b.status,
    slot: b.slot?.label ?? '—',
    pengajar: b.pengajar?.name ?? '(belum ada)',
    level: b.level,
    pita: b.pita_digabung ? 'pita digabung' : (b.pita_umur ?? '—'),
    putaran: b.putaran,
    peserta: hitung.get(b.id) ?? 0,
    terenrol: terenrol.get(b.id) ?? 0,
    tanggal_mulai: b.tanggal_mulai,
    tenggat: b.token_kedaluwarsa,
    tilawah_halaqah_id: b.tilawah_halaqah_id,
    grup_wa_link: b.grup_wa_link,
  }));
}

async function muatGrupPool(periodeId: string): Promise<BarisGrup[]> {
  const { data } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('id, gender, invite_link, status, usulan:usulan_id(nama_halaqah, slot:slot_id(label))')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });

  return ((data ?? []) as {
    id: string;
    gender: Gender;
    invite_link: string;
    status: string;
    usulan?: { nama_halaqah: string | null; slot?: { label: string } | null } | null;
  }[]).map((b) => ({
    id: b.id,
    gender: b.gender,
    invite_link: b.invite_link,
    status: b.status,
    halaqah: b.usulan ? (b.usulan.nama_halaqah ?? b.usulan.slot?.label ?? 'terpakai') : null,
  }));
}

async function muatSumber(periodeId: string): Promise<KsPendaftarSumber[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });
  return (data ?? []) as KsPendaftarSumber[];
}

interface BarisPengajar {
  nama: string;
  gender: Gender;
  slot: number;
  halaqahBaru: number;
  status: string;
}

async function muatPengajar(periodeId: string): Promise<BarisPengajar[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar_id, status, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);

  const baris = (pengisian ?? []) as {
    id: string;
    pengajar_id: string;
    status: string;
    pengajar?: { name: string; gender: Gender } | null;
  }[];
  if (baris.length === 0) return [];

  const { data: ket } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('pengisian_id, status');
  const slotPer = new Map<string, number>();
  for (const k of (ket ?? []) as { pengisian_id: string; status: string }[]) {
    if (k.status === 'ditolak') continue;
    slotPer.set(k.pengisian_id, (slotPer.get(k.pengisian_id) ?? 0) + 1);
  }

  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('pengajar_id, status')
    .eq('periode_id', periodeId)
    .in('status', ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim']);
  const halaqahPer = new Map<string, number>();
  for (const u of (usulan ?? []) as { pengajar_id: string | null }[]) {
    if (!u.pengajar_id) continue;
    halaqahPer.set(u.pengajar_id, (halaqahPer.get(u.pengajar_id) ?? 0) + 1);
  }

  return baris
    .filter((b) => b.pengajar)
    .map((b) => ({
      nama: b.pengajar!.name,
      gender: b.pengajar!.gender,
      slot: slotPer.get(b.id) ?? 0,
      halaqahBaru: halaqahPer.get(b.pengajar_id) ?? 0,
      status: b.status,
    }))
    // Yang belum kebagian ditaruh paling atas: itu yang perlu tindakan.
    .sort((a, b) => a.halaqahBaru - b.halaqahBaru || a.nama.localeCompare(b.nama));
}

// ── Tampilan ───────────────────────────────────────────────────────────────

function TabelSlot({
  slots,
  ringkas,
  kapasitas,
}: {
  slots: readonly KsSlot[];
  ringkas: Map<string, RingkasSlot>;
  kapasitas: number;
}) {
  if (slots.length === 0) {
    return <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada slot aktif.</p>;
  }
  const urut = [...slots].sort((a, b) => {
    const ra = ringkas.get(a.id);
    const rb = ringkas.get(b.id);
    if ((rb?.butuh_pengajar ? 1 : 0) !== (ra?.butuh_pengajar ? 1 : 0)) {
      return (rb?.butuh_pengajar ? 1 : 0) - (ra?.butuh_pengajar ? 1 : 0);
    }
    return (rb?.antre ?? 0) - (ra?.antre ?? 0);
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
            <th style={{ padding: '6px 8px' }}>Slot</th>
            <th style={{ padding: '6px 8px' }}>Kel.</th>
            <th style={{ padding: '6px 8px' }}>Antre</th>
            <th style={{ padding: '6px 8px' }}>Pengajar</th>
            <th style={{ padding: '6px 8px' }}>Halaqah</th>
            <th style={{ padding: '6px 8px' }}>Kapasitas</th>
            <th style={{ padding: '6px 8px' }}>Belum tertampung</th>
            <th style={{ padding: '6px 8px' }}>Antrean tertua</th>
          </tr>
        </thead>
        <tbody>
          {urut.map((s) => {
            const r = ringkas.get(s.id);
            return (
              <tr
                key={s.id}
                style={{
                  borderBottom: '1px solid var(--line)',
                  background: r?.butuh_pengajar ? 'var(--merah-tint)' : undefined,
                }}
              >
                <td style={{ padding: '6px 8px' }}>
                  {s.label}
                  {s.mode === 'offline' && (
                    <span style={{ color: 'var(--muted-2)' }}> · Offline</span>
                  )}
                  {r?.butuh_pengajar && (
                    <strong style={{ color: 'var(--merah-ink)' }}> · butuh pengajar</strong>
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>{s.kelompok === 'ikhwan' ? 'Ikh' : 'Akh'}</td>
                <td style={{ padding: '6px 8px' }}>{r?.antre ?? 0}</td>
                <td style={{ padding: '6px 8px' }}>
                  {r?.pengajar_tersedia ?? 0}
                  {r && r.pengajar_terpakai > 0 && (
                    <span style={{ color: 'var(--muted-2)' }}> ({r.pengajar_terpakai} terpakai)</span>
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>{r?.halaqah_hidup ?? 0}</td>
                <td style={{ padding: '6px 8px' }}>{(r?.halaqah_hidup ?? 0) * kapasitas}</td>
                <td style={{ padding: '6px 8px' }}>{r?.belum_tertampung ?? 0}</td>
                <td style={{ padding: '6px 8px' }}>
                  {r?.antrean_tertua_hari === null || r?.antrean_tertua_hari === undefined
                    ? '—'
                    : `${r.antrean_tertua_hari} hari`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabelPengajar({ baris }: { baris: readonly BarisPengajar[] }) {
  if (baris.length === 0) {
    return (
      <p className="t-small" style={{ color: 'var(--muted-2)' }}>
        Belum ada pengajar yang mengisi ketersediaan.
      </p>
    );
  }
  const belum = baris.filter((b) => b.halaqahBaru === 0).length;
  return (
    <>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        {baris.length} pengajar mengisi · <strong>{belum} belum kebagian halaqah</strong>
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
              <th style={{ padding: '6px 8px' }}>Nama</th>
              <th style={{ padding: '6px 8px' }}>Kel.</th>
              <th style={{ padding: '6px 8px' }}>Slot dipilih</th>
              <th style={{ padding: '6px 8px' }}>Halaqah baru</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 8px' }}>{b.nama}</td>
                <td style={{ padding: '6px 8px' }}>{b.gender === 'ikhwan' ? 'Ikh' : 'Akh'}</td>
                <td style={{ padding: '6px 8px' }}>{b.slot}</td>
                <td style={{ padding: '6px 8px' }}>{b.halaqahBaru}</td>
                <td style={{ padding: '6px 8px' }}>{b.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 className="t-h2" style={{ fontSize: 16, marginBottom: 8 }}>{judul}</h2>
      {children}
    </section>
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

function Bingkai({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>{children}</div>
      </div>
    </main>
  );
}
