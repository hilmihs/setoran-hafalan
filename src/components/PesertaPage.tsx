import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SetoranForm } from '@/components/SetoranForm';
import { formatWeekRange, currentWeekStart } from '@/lib/week';
import type { Gender } from '@/types/db';

export async function PesertaPage({ gender }: { gender: Gender }) {
  const [kelasRes, pesertaRes] = await Promise.all([
    supabaseAdmin
      .from('kelas')
      .select('id, name')
      .eq('gender', gender)
      .order('name'),
    supabaseAdmin
      .from('peserta')
      .select('id, name, kelas_id')
      .eq('gender', gender)
      .eq('active', true)
      .order('name'),
  ]);

  const kelasList = kelasRes.data ?? [];
  const pesertaList = pesertaRes.data ?? [];

  return (
    <main className="min-h-screen p-4 bg-stone-50">
      <div className="max-w-md mx-auto space-y-6 py-6">
        <header className="space-y-1">
          <Link href="/" className="text-xs text-stone-500 hover:text-stone-700">
            ← kembali
          </Link>
          <h1 className="text-xl font-semibold text-stone-800">
            Setoran Hafalan — {gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </h1>
          <p className="text-sm text-stone-600">
            Pekan {formatWeekRange(currentWeekStart())}
          </p>
        </header>

        {kelasList.length === 0 ? (
          <p className="text-sm text-stone-600">
            Belum ada kelas {gender} terdaftar. Hubungi koordinator.
          </p>
        ) : (
          <SetoranForm
            gender={gender}
            kelasList={kelasList}
            pesertaList={pesertaList}
          />
        )}
      </div>
    </main>
  );
}
