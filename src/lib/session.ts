import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import type {
  RoleAccess,
  PesertaSession,
  MusyrifSession,
  KoordinatorSession,
  SyaikhSession,
  PengajarSession,
  KoordinatorHitsSession,
  KetuaKelasSession,
  KoordinatorKetuaKelasSession,
} from '@/types/db';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters');
}

export const sessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: 'maahir-hits-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  },
};

interface IronSessionData {
  session?: RoleAccess;
  accesses?: RoleAccess[];
}

export async function getSession() {
  return getIronSession<IronSessionData>(cookies(), sessionOptions);
}

function requireRole<T extends RoleAccess>(role: T['role']) {
  return async (): Promise<T> => {
    const s = await getSession();
    if (s.accesses && s.accesses.length > 0) {
      const match = s.accesses.find((a) => a.role === role);
      if (match) return match as T;
    }
    if (s.session?.role === role) return s.session as T;
    throw new Error('UNAUTHORIZED');
  };
}

export const requirePeserta = requireRole<PesertaSession>('peserta');
export const requireMusyrif = requireRole<MusyrifSession>('musyrif');
export const requireKoordinator = requireRole<KoordinatorSession>('koordinator');
export const requireSyaikh = requireRole<SyaikhSession>('syaikh');
export const requirePengajar = requireRole<PengajarSession>('pengajar');
export const requireKoordinatorHits = requireRole<KoordinatorHitsSession>('koordinator_hits');
export const requireKetuaKelas = requireRole<KetuaKelasSession>('ketua_kelas');
export const requireKoordinatorKetuaKelas = requireRole<KoordinatorKetuaKelasSession>('koordinator_ketua_kelas');

export async function requireKetuaKelompok(): Promise<PengajarSession> {
  const s = await getSession();
  if (s.accesses) {
    const match = s.accesses.find(
      (a) => a.role === 'pengajar' && a.is_ketua
    ) as PengajarSession | undefined;
    if (match) return match;
  }
  if (s.session?.role === 'pengajar' && s.session.is_ketua) {
    return s.session;
  }
  throw new Error('UNAUTHORIZED');
}

export async function getActiveSession(): Promise<RoleAccess | null> {
  const s = await getSession();
  return s.session ?? null;
}

export async function getAllAccesses(): Promise<RoleAccess[]> {
  const s = await getSession();
  return s.accesses ?? (s.session ? [s.session] : []);
}
