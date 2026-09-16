import { notFound } from 'next/navigation';
import { requirePengajar } from '@/lib/session';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { formTerbuka, getPeriodeAktif, listSlot } from '@/lib/ketersediaan-periode';
import {
  alasanTerkunci,
  jadwalTerpakaiPengajar,
  kunciSlot,
} from '@/lib/ketersediaan-bentrok';
import { ringkasSlot, teksPeluang } from '@/lib/ketersediaan-permintaan';
import { FormKetersediaan, type SlotTampil } from './FormKetersediaan';

export const dynamic = 'force-dynamic';

export default async function KetersediaanPengajarPage() {
  const sesi = await requirePengajar();
  // Fitur masih disembunyikan: sudah ter-deploy tetapi belum diumumkan ke
  // pengajar. Menyembunyikan dari menu saja tidak cukup — URL-nya tetap bisa
  // diketik. 404, bukan redirect, supaya halamannya tidak terasa "ada tapi
  // dilarang" bagi yang belum berkepentingan.
  if (!(await bolehLihatFiturTersembunyi())) notFound();

  const sekarang = new Date();
  const periode = await getPeriodeAktif();

  const kop = (
    <div className="topbar">
      <div className="wordmark">
        <span className="mark">H</span> Ketersediaan Mengajar
      </div>
      <LogoutButton />
    </div>
  );

  if (!periode) {
    return (
      <Bingkai>
        {kop}
        <FeatureNav current="/ketersediaan/pengajar" />
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Ketersediaan Mengajar HITS</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Belum ada periode penarikan yang dibuka. Koordinator akan mengumumkan bila sudah siap.
        </p>
      </Bingkai>
    );
  }

  const terbuka = formTerbuka(periode, sekarang);
  const semuaSlot = await listSlot(periode.id, { hanyaAktif: true });
  const slot = semuaSlot.filter((s) => s.kelompok === sesi.gender);

  const [terpakai, ringkas] = await Promise.all([
    jadwalTerpakaiPengajar(sesi.pengajar_id, { acuan: periode.mulai }),
    ringkasSlot(periode, slot, sekarang),
  ]);
  const terkunci = kunciSlot(slot, terpakai);

  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, mode, lokasi, alasan_kurang_slot, komitmen, terkunci, submitted_at')
    .eq('periode_id', periode.id)
    .eq('pengajar_id', sesi.pengajar_id)
    .maybeSingle();

  let dipilih: string[] = [];
  const sanggahan = new Map<string, string>();
  if (pengisian) {
    const { data: baris } = await supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, status, sanggahan_status')
      .eq('pengisian_id', pengisian.id);
    for (const b of (baris ?? []) as {
      slot_id: string;
      status: string;
      sanggahan_status: string | null;
    }[]) {
      if (b.sanggahan_status) sanggahan.set(b.slot_id, b.sanggahan_status);
      // Baris yang hanya berisi sanggahan bukan pilihan — jangan dicentang.
      if (b.sanggahan_status === 'menunggu' && b.status === 'perlu_konfirmasi') continue;
      dipilih.push(b.slot_id);
    }
  }
  dipilih = [...new Set(dipilih)];

  const daftar: SlotTampil[] = slot.map((s) => {
    const r = ringkas.get(s.id);
    const kunci = terkunci.get(s.id);
    const statusSanggahan = sanggahan.get(s.id) ?? null;
    return {
      id: s.id,
      label: s.label,
      mode: s.mode,
      lokasi: s.lokasi,
      // Sanggahan yang sudah diterima membuka kunci — koordinator sudah menyatakan
      // jadwal lama itu memang sudah selesai.
      terkunci: Boolean(kunci) && statusSanggahan !== 'diterima',
      alasan_kunci: kunci ? alasanTerkunci(kunci) : null,
      sanggahan_status: statusSanggahan,
      antre: r?.antre ?? 0,
      belum_tertampung: r?.belum_tertampung ?? 0,
      butuh_pengajar: r?.butuh_pengajar ?? false,
      pengajar_tersedia: r?.pengajar_tersedia ?? 0,
      peluang: teksPeluang(r?.riwayat ?? null),
    };
  });

  const jadwalSaya = terpakai.map((t) => ({
    nama: t.nama,
    batch: t.batch,
    label: t.label,
    sumber: t.sumber,
  }));

  return (
    <Bingkai>
      {kop}
      <FeatureNav current="/ketersediaan/pengajar" />

      <h1 className="t-h1" style={{ marginBottom: 4 }}>Ketersediaan Mengajar HITS</h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        Periode <strong>{periode.nama}</strong>. Nyatakan slot waktu yang Anda sanggupi —
        bukan tanggal. Kelas dibentuk saat murid cukup dan pengajar tersedia.
      </p>

      {jadwalSaya.length > 0 && (
        <section
          style={{
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <h2 className="t-h2" style={{ marginBottom: 6, fontSize: 15 }}>
            Halaqah yang Anda pegang sekarang
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {jadwalSaya.map((j, i) => (
              <li key={i} className="t-small" style={{ marginBottom: 2 }}>
                <strong>{j.nama}</strong>
                {j.batch ? ` · ${j.batch}` : ''} — {j.label || 'jadwal tidak tercatat'}
                {j.sumber === 'maahir' ? ' (kelas Maahir)' : ''}
                {j.sumber === 'usulan' ? ' (halaqah baru)' : ''}
              </li>
            ))}
          </ul>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8, marginBottom: 0 }}>
            Slot pada jam yang sama dengan daftar di atas tampil terkunci di bawah.
          </p>
        </section>
      )}

      <FormKetersediaan
        slots={daftar}
        awalDipilih={dipilih}
        awalMode={(pengisian?.mode as 'online' | 'offline' | 'keduanya') ?? 'online'}
        awalLokasi={(pengisian?.lokasi as string | null) ?? ''}
        awalAlasan={(pengisian?.alasan_kurang_slot as string | null) ?? ''}
        sudahKirim={Boolean(pengisian?.submitted_at)}
        terkunciIsian={Boolean(pengisian?.terkunci)}
        minimalSlot={periode.minimal_slot}
        kapasitas={periode.kapasitas_halaqah}
        formTerbuka={terbuka}
      />
    </Bingkai>
  );
}

function Bingkai({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>{children}</div>
      </div>
    </main>
  );
}
