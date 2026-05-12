import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import type { Session } from '@/types/db';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters');
}

export const sessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: 'setoran-hafalan-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 hari
  },
};

interface SessionData {
  session?: Session;
}

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function requireMusyrif() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') {
    throw new Error('UNAUTHORIZED');
  }
  return s.session;
}

export async function requireKoordinator() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'koordinator') {
    throw new Error('UNAUTHORIZED');
  }
  return s.session;
}
