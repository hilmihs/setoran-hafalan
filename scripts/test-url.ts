// Uji fungsi murni helper URL. Jalankan: npm run test-url
//
// Kenapa ada: redirect yang dibangun dari `req.url`/`req.nextUrl` pernah bocor
// alamat bind server ke pengguna — ketua kelas yang mengeklik magic link dari
// WhatsApp mendarat di `http://0.0.0.0:3009/hits/ketua`. Tambalannya sempat
// ditulis dua kali di dua berkas berbeda dengan perilaku yang tidak sama, jadi
// aturannya dikunci di sini.
import { publicOrigin, appOrigin } from '@/lib/url';

let gagal = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    console.error(`FAIL ${label}\n  dapat : ${actual}\n  harusnya: ${expected}`);
    gagal++;
  } else {
    console.log(`ok   ${label}`);
  }
}

const h = (o: Record<string, string>) => new Headers(o);

// Produksi di balik reverse proxy — header proxy yang dipakai.
eq(
  publicOrigin(h({ 'x-forwarded-host': 'maahir.muhajirproject.org', 'x-forwarded-proto': 'https' })),
  'https://maahir.muhajirproject.org',
  'x-forwarded-host dipakai'
);

// Tanpa x-forwarded-proto → asumsikan https untuk host non-lokal.
eq(
  publicOrigin(h({ 'x-forwarded-host': 'maahir.muhajirproject.org' })),
  'https://maahir.muhajirproject.org',
  'host non-lokal default https'
);

// Host biasa dipakai bila tak ada x-forwarded-host.
eq(
  publicOrigin(h({ host: 'maahir.muhajirproject.org' })),
  'https://maahir.muhajirproject.org',
  'fallback ke header Host'
);

// INTI BUG: alamat bind tak pernah boleh bocor ke Location.
eq(
  publicOrigin(h({ host: '0.0.0.0:3009' })),
  appOrigin(),
  '0.0.0.0 ditolak, jatuh ke appOrigin'
);
eq(
  publicOrigin(h({ 'x-forwarded-host': '0.0.0.0:3009', host: '0.0.0.0:3009' })),
  appOrigin(),
  '0.0.0.0 ditolak walau datang dari x-forwarded-host'
);
eq(publicOrigin(h({})), appOrigin(), 'tanpa header sama sekali → appOrigin');

// Dev lokal HARUS tetap jalan — localhost sah, dan portnya tak boleh hilang.
eq(publicOrigin(h({ host: 'localhost:3000' })), 'http://localhost:3000', 'localhost + port utuh');
eq(publicOrigin(h({ host: '127.0.0.1:3000' })), 'http://127.0.0.1:3000', '127.0.0.1 + port utuh');

// Redirect yang dirakit di atasnya tetap mengarah ke domain publik.
eq(
  new URL('/hits/ketua', publicOrigin(h({ host: '0.0.0.0:3009' }))).toString(),
  `${appOrigin()}/hits/ketua`,
  'redirect magic-link tak bocor 0.0.0.0'
);
eq(
  new URL('/hits/ketua', publicOrigin(h({ host: 'localhost:3000' }))).toString(),
  'http://localhost:3000/hits/ketua',
  'redirect magic-link tetap benar di dev'
);

// appOrigin sendiri tak boleh memulangkan alamat yang tak bisa dibuka.
if (/0\.0\.0\.0/.test(appOrigin())) {
  console.error('FAIL appOrigin() memulangkan 0.0.0.0');
  gagal++;
} else {
  console.log('ok   appOrigin bukan 0.0.0.0');
}

console.log(gagal === 0 ? '\nSemua lulus.' : `\n${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
