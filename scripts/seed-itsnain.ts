/**
 * CLI wrapper. Logika utama di src/lib/seeds/seed-itsnain.ts.
 *
 *   npm run seed-itsnain
 */
import { runSeedItsnain } from '../src/lib/seeds/seed-itsnain';

runSeedItsnain((s) => console.log(s)).catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
