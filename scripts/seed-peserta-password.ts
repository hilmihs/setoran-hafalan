/**
 * CLI wrapper. Logika utama di src/lib/seeds/seed-peserta-password.ts.
 *
 *   npm run seed-peserta-password
 */
import { runSeedPesertaPassword } from '../src/lib/seeds/seed-peserta-password';

runSeedPesertaPassword((s) => console.log(s)).catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
