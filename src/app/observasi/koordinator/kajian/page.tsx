import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { todayJakarta } from '@/lib/maahir-presensi';
import { loadKajianRows, loadKajianLibur, loadKetuaWaList } from '@/lib/hits-kajian-db';
import { computeKajianRekap, deriveKajianState, sundaysInRange, KAJIAN_GHOSTING_DAYS, type KajianRow } from '@/lib/hits-kajian';
import { KajianTindakPanel, type TindakItem } from './KajianTindakPanel';
import { KajianLiburPanel } from './KajianLiburPanel';

export const dynamic = 'force-dynamic';
const MS_PER_DAY = 86_400_000;

function tanggalWib(d: string): string {
  return new Date(`${d}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export default async function KajianKoordinatorPage() {
  await requireKoordinatorKetuaKelas();
  const today = todayJakarta();
  const nowIso = new Date().toISOString();

  const ketua = await loadKetuaWaList();
  const waList = ketua.map((k) => k.ketua_wa);
  const namaByWa = new Map(ketua.map((k) => [k.ketua_wa, k.nama]));

  const liburRows = await loadKajianLibur();
  const liburSet = new Set(liburRows.map((l) => l.tanggal));

  const anchorRows = await loadKajianRows('2000-01-01');
  const anchor = anchorRows.length
    ? anchorRows.reduce((min, r) => (r.tanggal < min ? r.tanggal : min), anchorRows[0].tanggal)
    : today;

  const rows: KajianRow[] = anchorRows;
  const rekap = computeKajianRekap(rows, liburSet, waList, anchor, today, nowIso);

  const sesi = sundaysInRange(anchor, today).filter((d) => !liburSet.has(d));
  const byKey = new Map(rows.map((r) => [`${r.ketua_wa}|${r.tanggal}`, r]));
  const tindak: TindakItem[] = [];
  for (const wa of waList) {
    for (const tgl of sesi) {
      const row = byKey.get(`${wa}|${tgl}`) ?? null;
      const st = deriveKajianState(row, tgl, today, nowIso);
      if (st === 'belum-isi' || st === 'alpa') {
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
      <h1 className="text-xl font-bold">Presensi Kajian Adab — Koordinator</h1>

      <section>
        <h2 className="font-semibold mb-2">Rekap per Ketua</h2>
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
        <h2 className="font-semibold mb-2">Perlu Ditindak</h2>
        <KajianTindakPanel items={tindak} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">Libur Kajian</h2>
        <KajianLiburPanel libur={liburRows} />
      </section>
    </main>
  );
}
