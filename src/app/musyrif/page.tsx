import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentWeekStart, formatWeekRange } from '@/lib/week';
import { logout } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function MusyrifDashboard() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') redirect('/musyrif/login');
  const musyrifId = s.session.musyrif_id;

  const { data: kelasList } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender')
    .eq('musyrif_id', musyrifId);

  const kelasIds = (kelasList ?? []).map((k) => k.id);

  const { data: pesertaList } = await supabaseAdmin
    .from('peserta')
    .select('id, name, kelas_id')
    .in('kelas_id', kelasIds.length ? kelasIds : ['00000000-0000-0000-0000-000000000000']);

  const pesertaIds = (pesertaList ?? []).map((p) => p.id);

  const week = currentWeekStart();
  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at')
    .in('peserta_id', pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('week_start', week)
    .order('submitted_at', { ascending: false });

  const pesertaById = new Map(
    (pesertaList ?? []).map((p) => [p.id, p])
  );
  const kelasById = new Map((kelasList ?? []).map((k) => [k.id, k]));

  const pending = (setoranList ?? []).filter((s) => s.status === 'submitted');
  const checked = (setoranList ?? []).filter((s) => s.status === 'checked');

  return (
    <main className="min-h-screen p-4 bg-stone-50">
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-800">
              Dashboard Musyrif
            </h1>
            <p className="text-sm text-stone-600">
              {s.session.name} — pekan {formatWeekRange(week)}
            </p>
          </div>
          <form action={logout}>
            <button className="text-xs text-stone-500 hover:text-stone-700">
              Keluar
            </button>
          </form>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">
            Menunggu pemeriksaan ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-stone-500 italic">Tidak ada setoran tertunda.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((st) => {
                const p = pesertaById.get(st.peserta_id);
                const k = p ? kelasById.get(p.kelas_id) : null;
                return (
                  <li key={st.id} className="bg-white border border-stone-200 rounded-lg p-3">
                    <Link
                      href={`/musyrif/cek/${st.id}`}
                      className="flex items-baseline justify-between hover:underline"
                    >
                      <span className="font-medium text-stone-800">
                        {p?.name ?? '(peserta tidak ditemukan)'}
                      </span>
                      <span className="text-xs text-stone-500">
                        Kelas {k?.name ?? '-'} • {formatTime(st.submitted_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {checked.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-stone-700">
              Sudah diperiksa pekan ini
            </h2>
            <ul className="space-y-2">
              {checked.map((st) => {
                const p = pesertaById.get(st.peserta_id);
                const k = p ? kelasById.get(p.kelas_id) : null;
                return (
                  <li key={st.id} className="bg-stone-100 border border-stone-200 rounded-lg p-3">
                    <Link
                      href={`/musyrif/cek/${st.id}`}
                      className="flex items-baseline justify-between hover:underline"
                    >
                      <span className="text-stone-700">
                        {p?.name ?? '(peserta tidak ditemukan)'}
                      </span>
                      <span className="text-xs text-stone-500">
                        Kelas {k?.name ?? '-'} • dicek {formatTime(st.checked_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
