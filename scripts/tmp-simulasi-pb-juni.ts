import { deriveHalaqahProgram, type KaldikHariLite } from '@/lib/hits-pertemuan';
import type { HitsLevel } from '@/types/db';

const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function grid(start: string, pekanCount: number): KaldikHariLite[] {
  const out: KaldikHariLite[] = [];
  const d0 = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < pekanCount * 7; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    out.push({ tanggal: d.toISOString().slice(0, 10), pekan: Math.floor(i / 7) + 1, is_libur: false });
  }
  return out;
}

const qn = grid('2026-06-22', 13);           // kaldik QN Juni (nyata)
const pbSekarang = grid('2026-06-22', 12);   // kaldik PB Juni (kondisi prod sekarang)
const pbUsulan = grid('2026-09-21', 12);     // kaldik PB setelah digeser +91 hari

const jadwal = ["Selasa", "Jum'at"]; // mis. HITS 024 AKHWAT JUNI

for (const [label, pb] of [['SEKARANG', pbSekarang], ['USULAN', pbUsulan]] as const) {
  const byLevel = new Map<HitsLevel, KaldikHariLite[]>([
    ['qoidah_nuroniyyah', qn],
    ['perbaikan_bacaan', pb],
  ]);
  const derived = deriveHalaqahProgram('dasar', jadwal, byLevel, new Map());
  const qnRows = derived.filter((d) => d.level === 'qoidah_nuroniyyah');
  const pbRows = derived.filter((d) => d.level === 'perbaikan_bacaan');
  console.log(`\n[${label}] QN=${qnRows.length} (${qnRows.at(0)?.tanggal}..${qnRows.at(-1)?.tanggal})  PB=${pbRows.length}`);
  if (pbRows.length) {
    console.log(`  PB pertama: no ${pbRows[0].pertemuan_no} @ ${pbRows[0].tanggal}`);
    console.log(`  PB terakhir: no ${pbRows.at(-1)!.pertemuan_no} @ ${pbRows.at(-1)!.tanggal}`);
  }
}
