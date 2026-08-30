// Shim khusus skrip tsx.
//
// `server-only` bukan paket yang terpasang: Next me-resolve-nya sendiri saat
// membangun, sebagai penanda agar modul tidak ikut terbawa ke bundel klien.
// Di luar Next penanda itu tidak berarti apa-apa, tetapi impornya tetap harus
// bisa diselesaikan agar skrip pengujian dapat memuat pustaka server.
//
// Dipakai lewat NODE_PATH=./scripts/node-shims (lihat package.json), sehingga
// tidak menyentuh resolusi modul aplikasi sama sekali.
module.exports = {};
