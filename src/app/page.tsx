import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="max-w-md w-full space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-stone-800">
            Setoran Hafalan
          </h1>
          <p className="text-sm text-stone-600">
            Pilih jalur sesuai peran Anda
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-stone-700">Peserta</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/ikhwan"
              className="block text-center py-4 px-4 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition"
            >
              Ikhwan
            </Link>
            <Link
              href="/akhwat"
              className="block text-center py-4 px-4 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition"
            >
              Akhwat
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-stone-700">
            Musyrif & Koordinator
          </h2>
          <div className="space-y-2">
            <Link
              href="/musyrif/login"
              className="block text-center py-3 px-4 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition text-sm"
            >
              Login Musyrif
            </Link>
            <Link
              href="/koordinator/login"
              className="block text-center py-3 px-4 bg-white border border-stone-200 rounded-lg hover:bg-stone-100 transition text-sm"
            >
              Login Koordinator
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
