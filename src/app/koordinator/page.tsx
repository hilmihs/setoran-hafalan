import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import {
  currentWeekStart,
  formatWeekRange,
  previousWeeks,
} from '@/lib/week';
import {
  buildWaMeUrl,
  tplReminderPesertaBelumSetor,
  tplReminderMusyrifBelumCek,
} from '@/lib/whatsapp';
import {
  JENIS_REKAMAN_LABEL,
  type Gender,
  type NilaiRekaman,
  type StatusSetoran,
} from '@/types/db';

export const dynamic = 'force-dynamic';

type SP = { week?: string; gender?: string; kelas?: string };

export default async function KoordinatorDashboard({
  searchParams,
}: {
  searchParams: SP;
}) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'koordinator') {
    redirect('/koordinator/login');
  }

  const week = searchParams.week ?? currentWeekStart();
  const genderFilter = (searchParams.gender as Gender | undefined) ?? null;
  const kelasFilter = searchParams.kelas ?? null;

  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';

  let kelasQuery = supabaseAdmin
    .from('kelas')
    .select('id, name, gender, musyrif:musyrif_id(id, name, whatsapp_number)')
    .order('gender')
    .order('name');
  if (genderFilter) kelasQuery = kelasQuery.eq('gender', genderFilter);
  const { data: kelasList } = await kelasQuery;

  const kelasIds = (kelasList ?? [])
    .filter((k) => !kelasFilter || k.id === kelasFilter)
    .map((k) => k.id);

  let pesertaQuery = supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id, whatsapp_number')
    .eq('active', true)
    .order('name');
  if (kelasIds.length > 0) {
    pesertaQuery = pesertaQuery.in('kelas_id', kelasIds);
  } else if (genderFilter || kelasFilter) {
    // no kelas matched filter
    pesertaQuery = pesertaQuery.eq(
      'id',
      '00000000-0000-0000-0000-000000000000'
    );
  }
  const { data: pesertaList } = await pesertaQuery;

  const pesertaIds = (pesertaList ?? []).map((p) => p.id);

  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, status, submitted_at, checked_at')
    .in(
      'peserta_id',
      pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', week);

  const setoranByPeserta = new Map(
    (setoranList ?? []).map((s) => [s.peserta_id, s])
  );

  const setoranIds = (setoranList ?? []).map((s) => s.id);
  const { data: rekamanList } = await supabaseAdmin
    .from('rekaman')
    .select('setoran_id, jenis, nilai')
    .in(
      'setoran_id',
      setoranIds.length ? setoranIds : ['00000000-0000-0000-0000-000000000000']
    );

  const rekamanBySetoran = new Map<string, { nilai: NilaiRekaman | null; jenis: string }[]>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    arr.push({ nilai: r.nilai as NilaiRekaman | null, jenis: r.jenis });
    rekamanBySetoran.set(r.setoran_id, arr);
  }

  const kelasById = new Map(
    (kelasList ?? []).map((k) => [
      k.id,
      k as unknown as {
        id: string;
        name: string;
        gender: Gender;
        musyrif: { id: string; name: string; whatsapp_number: string };
      },
    ])
  );

  const rows = (pesertaList ?? []).map((p) => {
    const setoran = setoranByPeserta.get(p.id);
    const rekaman = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
    return { peserta: p, setoran, rekaman };
  });

  // counters
  const counters = {
    total: rows.length,
    submitted: rows.filter((r) => r.setoran?.status === 'submitted').length,
    checked: rows.filter((r) => r.setoran?.status === 'checked').length,
    notYet: rows.filter((r) => !r.setoran || r.setoran.status === 'draft').length,
  };

  const weekOptions = [currentWeekStart(), ...previousWeeks(8)];
  const allKelasForFilter = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender')
    .order('gender')
    .order('name');

  return (
    <main className="min-h-screen p-4 bg-stone-50">
      <div className="max-w-5xl mx-auto space-y-6 py-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-800">
              Dashboard Koordinator
            </h1>
            <p className="text-sm text-stone-600">{s.session.name}</p>
          </div>
          <form action={logout}>
            <button className="text-xs text-stone-500 hover:text-stone-700">
              Keluar
            </button>
          </form>
        </header>

        <form
          method="get"
          className="flex flex-wrap items-end gap-3 bg-white border border-stone-200 rounded-lg p-3"
        >
          <label className="block">
            <span className="text-xs text-stone-600">Pekan</span>
            <select
              name="week"
              defaultValue={week}
              className="block w-full rounded border border-stone-300 px-2 py-1 text-sm bg-white"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {formatWeekRange(w)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-600">Gender</span>
            <select
              name="gender"
              defaultValue={genderFilter ?? ''}
              className="block rounded border border-stone-300 px-2 py-1 text-sm bg-white"
            >
              <option value="">Semua</option>
              <option value="ikhwan">Ikhwan</option>
              <option value="akhwat">Akhwat</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-600">Kelas</span>
            <select
              name="kelas"
              defaultValue={kelasFilter ?? ''}
              className="block rounded border border-stone-300 px-2 py-1 text-sm bg-white"
            >
              <option value="">Semua</option>
              {(allKelasForFilter.data ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.gender})
                </option>
              ))}
            </select>
          </label>
          <button className="px-3 py-1 bg-stone-800 text-white text-sm rounded hover:bg-stone-700">
            Terapkan
          </button>
          <Link
            href="/koordinator"
            className="text-xs text-stone-500 hover:text-stone-700 self-center"
          >
            reset
          </Link>
        </form>

        <div className="grid grid-cols-4 gap-3 text-center">
          <Stat label="Total" value={counters.total} />
          <Stat label="Belum setor" value={counters.notYet} tone="red" />
          <Stat label="Menunggu cek" value={counters.submitted} tone="yellow" />
          <Stat label="Selesai" value={counters.checked} tone="green" />
        </div>

        <div className="overflow-x-auto bg-white border border-stone-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <th className="text-left px-3 py-2">Peserta</th>
                <th className="text-left px-3 py-2">Kelas</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Nilai</th>
                <th className="text-left px-3 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ peserta, setoran, rekaman }) => {
                const kelas = kelasById.get(peserta.kelas_id);
                const status = (setoran?.status as StatusSetoran | undefined) ?? null;
                return (
                  <tr key={peserta.id} className="border-t border-stone-100 align-top">
                    <td className="px-3 py-2 font-medium text-stone-800">
                      {peserta.name}
                      <div className="text-xs text-stone-500 font-normal">
                        {peserta.gender}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-stone-700">{kelas?.name ?? '-'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-3 py-2">
                      {status === 'checked' && rekaman.length > 0 ? (
                        <div className="space-y-0.5 text-xs">
                          {rekaman.map((r) => (
                            <div key={r.jenis}>
                              <span className="text-stone-500">
                                {JENIS_REKAMAN_LABEL[r.jenis as keyof typeof JENIS_REKAMAN_LABEL] ?? r.jenis}:
                              </span>{' '}
                              <NilaiTag nilai={r.nilai} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-stone-400 text-xs italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ActionCell
                        status={status}
                        peserta={peserta}
                        setoranId={setoran?.id ?? null}
                        kelas={kelas}
                        appOrigin={appOrigin}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-stone-500">
                    Tidak ada peserta sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'red' | 'yellow' | 'green';
}) {
  const toneClass =
    tone === 'red'
      ? 'text-red-700'
      : tone === 'yellow'
        ? 'text-yellow-700'
        : tone === 'green'
          ? 'text-green-700'
          : 'text-stone-800';
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-stone-600">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusSetoran | null }) {
  if (status === 'checked') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
        sudah dicek
      </span>
    );
  }
  if (status === 'submitted') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
        menunggu cek
      </span>
    );
  }
  if (status === 'draft') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs bg-stone-100 text-stone-700">
        draft
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
      belum setor
    </span>
  );
}

function NilaiTag({ nilai }: { nilai: NilaiRekaman | null }) {
  if (!nilai) return <span className="text-stone-400">—</span>;
  const cls =
    nilai === 'hijau'
      ? 'bg-green-100 text-green-800'
      : nilai === 'kuning'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded ${cls}`}>{nilai}</span>
  );
}

function ActionCell({
  status,
  peserta,
  setoranId,
  kelas,
  appOrigin,
}: {
  status: StatusSetoran | null;
  peserta: { name: string; whatsapp_number: string; gender: Gender };
  setoranId: string | null;
  kelas:
    | {
        name: string;
        gender: Gender;
        musyrif: { name: string; whatsapp_number: string };
      }
    | undefined;
  appOrigin: string;
}) {
  if (!status || status === 'draft') {
    const setorUrl = `${appOrigin}/${peserta.gender}`;
    const waUrl = buildWaMeUrl(
      peserta.whatsapp_number,
      tplReminderPesertaBelumSetor({
        pesertaName: peserta.name,
        setorUrl,
      })
    );
    return (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener"
        className="inline-block text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
      >
        WA pengingat peserta
      </a>
    );
  }
  if (status === 'submitted' && setoranId && kelas) {
    const cekUrl = `${appOrigin}/musyrif/cek/${setoranId}`;
    const waUrl = buildWaMeUrl(
      kelas.musyrif.whatsapp_number,
      tplReminderMusyrifBelumCek({
        musyrifName: kelas.musyrif.name,
        pesertaName: peserta.name,
        kelasName: kelas.name,
        cekUrl,
      })
    );
    return (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener"
        className="inline-block text-xs px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
      >
        WA pengingat musyrif
      </a>
    );
  }
  return <span className="text-xs text-stone-400">—</span>;
}
