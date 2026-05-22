/**
 * CLI wrapper. Logika utama di src/lib/seeds/seed-syaikh.ts agar bisa juga
 * dipanggil dari server action (UI /koordinator/admin).
 *
 *   npm run seed-syaikh
 */
import { runSeedSyaikh } from '../src/lib/seeds/seed-syaikh';

runSeedSyaikh((s) => console.log(s)).catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
