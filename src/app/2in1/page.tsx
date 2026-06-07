import { redirect } from 'next/navigation';
import { getAllAccesses } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page2in1() {
  const accesses = await getAllAccesses();
  const roleMap: Record<string, string> = {
    peserta: '/2in1/peserta',
    musyrif: '/2in1/musyrif',
    koordinator: '/2in1/koordinator',
    syaikh: '/2in1/syaikh',
  };
  for (const a of accesses) {
    if (roleMap[a.role]) {
      redirect(roleMap[a.role]);
    }
  }
  redirect('/');
}
