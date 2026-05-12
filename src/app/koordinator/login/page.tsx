import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { loginKoordinator } from '@/lib/auth';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function KoordinatorLoginPage() {
  const s = await getSession();
  if (s.session?.role === 'koordinator') redirect('/koordinator');

  return (
    <main className="min-h-screen p-4 bg-stone-50 flex items-center justify-center">
      <div className="max-w-sm w-full space-y-4">
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-700">
          ← kembali
        </Link>
        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <LoginForm action={loginKoordinator} title="Login Koordinator" />
        </div>
      </div>
    </main>
  );
}
