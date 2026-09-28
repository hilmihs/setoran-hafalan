import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { getSession, getAllAccesses } from '@/lib/session';
import { currentCycleStart, formatCycleRange } from '@/lib/week';
import { formatCycleRangeShort } from '@/lib/week';
import { ROLE_LANDING } from '@/lib/roles';
import { featureLinksFor, FEATURE_GROUPS, type FeatureGroup } from '@/lib/feature-links';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';
import { isSuperadmin } from '@/lib/admin-guard';
import { getSessionWa, findKetuaProgramKelas, findSelfAttendanceMembership } from '@/lib/program-kelas';
import { getUnfilledMaahirDays, getUnfilledDaysForAnggota } from '@/lib/maahir-presensi';
import { fiturOptsMaahirPengajar } from '@/lib/maahir-checkin-pengajar-akses';
import { getAntrianCheckin, kunciSesi } from '@/lib/attendance';
import { todayJakarta } from '@/lib/anggota-periode';
import { tanggalTanpaTahun, daftarHari, jamTitik } from '@/lib/tanggal-id';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import type { PengajarSession } from '@/types/db';

type Tugas = { href: string; title: string; sub: string; warna: 'merah' | 'kuning' };
type MenuItem = { href: string; title: string; short: string; group: FeatureGroup };

/** [latar, tinta] tanda huruf per kelompok menu. */
const WARNA_KELOMPOK: Record<FeatureGroup, [string, string]> = {
  mengajar: ['var(--accent-tint)', 'var(--accent-2)'],
  maahir: ['var(--hijau-tint)', 'var(--hijau-ink)'],
  nilai: ['var(--kuning-tint)', 'var(--kuning-ink)'],
  koordinasi: ['var(--surface-3)', 'var(--ink-2)'],
  admin: ['var(--merah-tint)', 'var(--merah-ink)'],
  lainnya: ['var(--surface-3)', 'var(--ink-2)'],
};

/** 'Ust. Abdullah Fauzi' → 'AF' — gelar berakhiran titik dilewati. */
function inisial(nama: string): string {
  const kata = nama.split(/\s+/).filter((w) => w && !w.endsWith('.'));
  return kata.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** 'A', 'A & B', 'A, B +2' — nama unik, dipendekkan. */
function ringkasNama(nama: string[]): string {
  const unik = Array.from(new Set(nama));
  if (unik.length <= 2) return unik.join(' & ');
  return `${unik.slice(0, 2).join(', ')} +${unik.length - 2}`;
}

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: { next?: string } }) {
  const s = await getSession();
  const accesses = await getAllAccesses();
  const nextRaw = searchParams?.next ?? '';
  const safeNext = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;

  if (accesses.length >= 1) {
    // Sudah login tapi diarahkan dgn ?next= (mis. ganti akun) → ke tujuan.
    if (safeNext) redirect(safeNext);

    // Ketua/wakil kelas Maahir wajib selesaikan presensi yang terluput dulu.
    const wa = await getSessionWa();
    const isKetuaMaahir = wa ? (await findKetuaProgramKelas(wa)).length > 0 : false;
    if (wa && isKetuaMaahir) {
      const unfilled = await getUnfilledMaahirDays(wa);
      if (unfilled.length > 0) redirect('/2in1/ketua-kelas/presensi');
    }

    // Presensi mandiri (kelas self_attendance, mis. Maahir Takhassus Ikhwan):
    // peserta isi sendiri lewat akunnya.
    const selfMembership = wa ? await findSelfAttendanceMembership(wa) : null;
    const selfUnfilled = selfMembership
      ? (await getUnfilledDaysForAnggota(selfMembership.kelas, selfMembership.anggotaId)).length
      : 0;

    const available = featureLinksFor(accesses, {
      superadmin: await bolehLihatFiturTersembunyi(),
      ...(await fiturOptsMaahirPengajar()),
    });
    const superadmin = await isSuperadmin();

    // Ketua Maahir / peserta mandiri tak punya entri di FEATURE_LINKS; tambah kartu sintetis.
    if (available.length === 1 && !isKetuaMaahir && !selfMembership && !superadmin) {
      redirect(available[0].href);
    }

    const userName = accesses[0]?.name ?? '';
    const today = todayJakarta();

    // "Perlu diselesaikan" — tugas yang menunggu, ditampilkan di atas menu.
    const tugas: Tugas[] = [];
    const pengajar = accesses.find((a): a is PengajarSession => a.role === 'pengajar');
    if (pengajar) {
      const antrian = await getAntrianCheckin(pengajar.pengajar_id);
      if (antrian.lampau.length > 0) {
        tugas.push({
          href: '/kehadiran/pengajar',
          warna: 'merah',
          title: `Isi ${antrian.lampau.length} kehadiran yang terlewat`,
          sub: `${ringkasNama(antrian.lampau.map((p) => p.name))} · ${daftarHari(antrian.lampau.map((p) => p.tanggal))}`,
        });
      }
      const belumHariIni = antrian.hariIni.filter((p) => !antrian.terisiHariIni.includes(kunciSesi(p)));
      if (belumHariIni.length > 0) {
        const [satu] = belumHariIni;
        tugas.push({
          href: '/kehadiran/pengajar',
          warna: 'kuning',
          title: belumHariIni.length === 1 ? 'Check-in kehadiran hari ini' : `Check-in ${belumHariIni.length} sesi hari ini`,
          sub: belumHariIni.length === 1
            ? `${satu.name} · ${jamTitik(satu.waktu_mulai)}`
            : ringkasNama(belumHariIni.map((p) => p.name)),
        });
      }
    }
    if (selfMembership && selfUnfilled > 0) {
      tugas.push({
        href: '/2in1/maahir-mandiri',
        warna: 'kuning',
        title: `Isi ${selfUnfilled} presensi mandiri`,
        sub: selfMembership.kelas.name,
      });
    }

    // Menu berkelompok. Ketua Maahir / peserta mandiri / superadmin tak punya
    // entri di FEATURE_LINKS; tambah entri sintetis di kelompoknya.
    const menu: MenuItem[] = [
      ...(isKetuaMaahir
        ? [{ href: '/2in1/ketua-kelas', title: 'Presensi Kelas Maahir', short: 'Sebagai ketua kelas · Kelas Maahir, At-Tibyan', group: 'maahir' as const }]
        : []),
      ...(selfMembership
        ? [{ href: '/2in1/maahir-mandiri', title: 'Presensi Mandiri', short: `Tandai kehadiran Anda — ${selfMembership.kelas.name}`, group: 'maahir' as const }]
        : []),
      ...(superadmin
        ? [
            { href: '/admin/audit', title: 'Log Aktivitas', short: 'Riwayat audit semua aksi pengguna', group: 'admin' as const },
            { href: '/admin/users', title: 'Manajemen User', short: 'Akun, reset password, login sebagai', group: 'admin' as const },
          ]
        : []),
      ...available,
    ];
    const kelompok = FEATURE_GROUPS.map((g) => ({
      ...g,
      items: menu.filter((m) => m.group === g.key),
    })).filter((g) => g.items.length > 0);

    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="page" style={{ paddingTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <div className="wordmark">
                <span className="mark">M</span>
                Muhajir Project Tilawah
              </div>
              <a
                href="/akun"
                title="Akun"
                aria-label="Akun"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--surface-3)',
                  color: 'var(--ink-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {inisial(userName)}
              </a>
            </div>

            <h1 className="t-h1" style={{ marginBottom: 4 }}>
              Assalamu&apos;alaikum, {userName}
            </h1>
            <p className="t-body" style={{ marginBottom: 20, color: 'var(--muted)' }}>
              {tanggalTanpaTahun(today)}
              {tugas.length > 0 ? ` · ${tugas.length} hal menunggu Anda` : ''}
            </p>

            {tugas.length > 0 && (
              <>
                <div className="t-tiny" style={{ margin: '0 2px 8px' }}>Perlu diselesaikan</div>
                <div className="card" style={{ overflow: 'hidden', marginBottom: 22 }}>
                  {tugas.map((t) => (
                    <a key={t.title} href={t.href} className="list-row" style={{ padding: 14 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${t.warna})`, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
                        <div className="sub">{t.sub}</div>
                      </div>
                      <span className="arrow" style={{ color: 'var(--muted)' }}>{Icon.arrow(14)}</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            {kelompok.map((g) => (
              <section key={g.key}>
                <div className="t-tiny" style={{ margin: '0 2px 8px' }}>{g.label}</div>
                <div className="card-flat" style={{ overflow: 'hidden', marginBottom: 18 }}>
                  {g.items.map((it) => (
                    <a key={it.href} href={it.href} className="list-row">
                      <span className="list-mark" style={{ background: WARNA_KELOMPOK[g.key][0], color: WARNA_KELOMPOK[g.key][1] }}>
                        {it.title.charAt(0)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</div>
                        <div className="sub">{it.short}</div>
                      </div>
                      <span className="arrow">{Icon.arrow(14)}</span>
                    </a>
                  ))}
                </div>
              </section>
            ))}

            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <LogoutButton style={{ height: 36 }} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 56 }}>
          <div className="wordmark" style={{ marginBottom: 24 }}>
            <span className="mark">M</span>
            Muhajir Project Tilawah
          </div>

          <h1 className="t-h1" style={{ marginBottom: 6 }}>Assalamu&apos;alaikum</h1>
          <p className="t-body" style={{ marginBottom: 26 }}>
            Masuk dengan nomor WhatsApp dan password Anda.
          </p>

          <LoginForm next={safeNext ?? undefined} />

          {/* Shakwa terbuka tanpa akun — pelapor luar tetap punya jalan masuk. */}
          <a
            href="/shakwa"
            className="card-flat"
            style={{
              display: 'block',
              padding: '14px 18px',
              marginTop: 20,
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Sampaikan Shakwa</div>
            <div className="t-small" style={{ color: 'var(--muted-2)' }}>
              Aduan, izin, masukan, atau cerita menarik — tanpa perlu masuk
            </div>
          </a>

          <p
            className="t-small"
            style={{ textAlign: 'center', marginTop: 22, color: 'var(--muted-2)' }}
          >
            Periode {formatCycleRangeShort(currentCycleStart())}
          </p>
        </div>
      </div>
    </main>
  );
}
