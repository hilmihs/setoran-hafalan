/**
 * CLI wrapper. Logika utama di src/lib/seeds/reset-setoran.ts.
 *
 *   npm run reset-setoran
 */
import { runResetSetoran } from '../src/lib/seeds/reset-setoran';

runResetSetoran((s) => console.log(s)).catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
