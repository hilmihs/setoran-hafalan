import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { isSuperadmin } from '@/lib/admin-guard';
import { todayJakarta } from '@/lib/maahir-presensi';
import { loadKajianRows, loadKajianLibur, loadKetuaWaList } from '@/lib/hits-kajian-db';
import {
  computeKajianRekap, deriveKajianState, sundaysInRange, monthsInRange, monthBounds,
  KAJIAN_GHOSTING_DAYS, type KajianRow,
} from '@/lib/hits-kajian';
import { KajianTindakPanel, type TindakItem } from './KajianTindakPanel';
import { KajianLiburPanel } from './KajianLiburPanel';
import { KajianFilterBar } from './KajianFilterBar';

export const dynamic = 'force-dynamic';
const MS_PER_DAY = 86_400_000;

function tanggalWib(d: string): string {
  return new Date(`${d}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

function labelBulan(ym: string): string {
  return new Date(`${ym}-01T12:00:00+07:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

type SP = { gender?: string; bulan?: string };

export default async function KajianKoordinatorPage({ searchParams }: { searchParams: SP }) {
  const session = await requireKoordinatorKetuaKelas();
  const today = todayJakarta();

  // Superadmin boleh lintas-gender via ?gender=; koordinator biasa terkunci ke gender-nya.
  const superadmin = await isSuperadmin();
  const viewGender =
    superadmin && (searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat')
      ? searchParams.gender
      : session.gender;
  const nowIso = new Date().toISOString();
  const cutoffTindak = new Date(new Date(`${today}T00:00:00+07:00`).getTime() - 21 * 86_400_000)
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const ketua = await loadKetuaWaList(viewGender);
  const waList = ketua.map((k) => k.ketua_wa);
  const namaByWa = new Map(ketua.map((k) => [k.ketua_wa, k.nama]));

  const liburRows = await loadKajianLibur();
  const liburSet = new Set(liburRows.map((l) => l.tanggal));

  const anchorRows = await loadKajianRows('2000-01-01');
  const anchor = anchorRows.length
    ? anchorRows.reduce((min, r) => (r.tanggal < min ? r.tanggal : min), anchorRows[0].tanggal)
    : today;

  const rows: KajianRow[] = anchorRows;

  // Filter bulan untuk REKAP saja; panel "Perlu Ditindak" tetap lintas-periode.
  const bulanOptions = monthsInRange(anchor, today).map((v) => ({ value: v, label: labelBulan(v) }));
  const bulan =
    searchParams.bulan && bulanOptions.some((o) => o.value === searchParams.bulan)
      ? searchParams.bulan
      : null;
  const periode = bulan ? monthBounds(bulan) : null;
  // Clamp ke anchor: bulan pertama bisa mulai sebelum sesi pertama ada.
  const rekapStart = periode ? (periode.start > anchor ? periode.start : anchor) : anchor;
  const rekap = computeKajianRekap(rows, liburSet, waList, rekapStart, today, nowIso, periode?.end);
  const totalSesi = rekap[0]?.totalSesi ?? 0;

  const sesi = sundaysInRange(anchor, today).filter((d) => !liburSet.has(d));
  const byKey = new Map(rows.map((r) => [`${r.ketua_wa}|${r.tanggal}`, r]));
  const tindak: TindakItem[] = [];
  for (const wa of waList) {
    for (const tgl of sesi) {
      const row = byKey.get(`${wa}|${tgl}`) ?? null;
      const st = deriveKajianState(row, tgl, today, nowIso);
      const recentOrReminded = tgl >= cutoffTindak || Boolean(row?.reminder_sent_at);
      if ((st === 'belum-isi' || st === 'alpa') && recentOrReminded) {
        let sisaHari: number | null = null;
        if (st === 'belum-isi' && row?.reminder_sent_at) {
          const deadline = new Date(row.reminder_sent_at).getTime() + KAJIAN_GHOSTING_DAYS * MS_PER_DAY;
          sisaHari = Math.max(0, Math.ceil((deadline - new Date(nowIso).getTime()) / MS_PER_DAY));
        }
        tindak.push({ ketuaWa: wa, namaKetua: namaByWa.get(wa) ?? '(ketua)', tanggal: tgl, tanggalWib: tanggalWib(tgl), state: st, sisaHari });
      }
    }
  }
  tindak.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Presensi Kajian Adab — Koordinator</h1>
        <p className="text-sm text-gray-600">
          {session.name} — {viewGender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} — {today}
        </p>
      </div>

      <KajianFilterBar
        bulan={bulan}
        bulanOptions={bulanOptions}
        gender={viewGender}
        showGender={superadmin}
      />

      <section>
        <h2 className="font-semibold mb-2">
          Rekap per Ketua
          <span className="ml-2 font-normal text-sm text-gray-500">
            {bulan ? labelBulan(bulan) : 'semua periode'} · {totalSesi} sesi · {waList.length} ketua
          </span>
        </h2>
        {waList.length === 0 && (
          <p className="text-sm text-gray-500">Belum ada ketua kelas aktif untuk gender ini.</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2">Ketua</th><th className="p-2">Hadir</th><th className="p-2">Telat</th>
              <th className="p-2">Izin</th><th className="p-2">Sakit</th><th className="p-2">Alpa</th>
              <th className="p-2">Belum</th><th className="p-2">%</th>
            </tr></thead>
            <tbody>
              {rekap.map((r) => (
                <tr key={r.ketua_wa} className="border-t">
                  <td className="p-2 text-left">{namaByWa.get(r.ketua_wa)}</td>
                  <td className="p-2 text-center">{r.hadir}</td><td className="p-2 text-center">{r.terlambat}</td>
                  <td className="p-2 text-center">{r.izin}</td><td className="p-2 text-center">{r.sakit}</td>
                  <td className="p-2 text-center">{r.alpa}</td><td className="p-2 text-center">{r.belumIsi}</td>
                  <td className="p-2 text-center font-semibold">{r.persen}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">
          Perlu Ditindak
          <span className="ml-2 font-normal text-sm text-gray-500">semua periode, tak ikut filter bulan</span>
        </h2>
        <KajianTindakPanel items={tindak} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">Libur Kajian</h2>
        <KajianLiburPanel libur={liburRows} />
      </section>
    </main>
  );
}
