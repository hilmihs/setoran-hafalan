// Recompute matrix_rekap untuk bulan live tertentu memakai logika app
// (computeMatrixForMonth) — dipakai setelah fix bug chunking soft-skill.
// Jalankan: npm run recompute-matrix 2026-06 2026-07
// Tanpa argumen: default bulan berjalan + bulan lalu.
import { computeMatrixForMonth, isLiveMatrixMonth } from '../src/lib/matrix-compute';

async function main() {
  const months = process.argv.slice(2);
  if (!months.length) {
    console.error('Usage: npm run recompute-matrix <YYYY-MM> [YYYY-MM ...]');
    process.exit(1);
  }
  for (const ym of months) {
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      console.error(`Skip "${ym}": format harus YYYY-MM`);
      continue;
    }
    if (!isLiveMatrixMonth(ym)) {
      console.error(`Skip ${ym}: bulan historis (< anchor), lindungi seed`);
      continue;
    }
    const rows = await computeMatrixForMonth(ym);
    const soft = rows.filter((r) => r.skor_kedisiplinan_waktu !== null).length;
    console.log(`${ym}: ${rows.length} pengajar, ${soft} punya skor soft-skill`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
