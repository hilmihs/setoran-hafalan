import 'server-only';
import type {
  TilawahBatch,
  TilawahDay,
  TilawahEnvelope,
  TilawahHalaqah,
  TilawahLevel,
  TilawahProgram,
  TilawahSession,
  TilawahUser,
} from './types';

/**
 * Klien CMS tilawah.
 *
 * CMS tidak menyediakan token API sama sekali — autentikasinya sesi Laravel
 * Sanctum hasil login borang. Konsekuensinya maahir menyimpan kredensial akun
 * layanan dan memelihara cookie jar sendiri. Ini titik terapuh seluruh
 * integrasi: bila CMS mengubah borang login atau memutar sandi, seluruh
 * pengiriman berhenti.
 *
 * Alur login (diverifikasi di staging 30 Agustus 2026):
 *   GET  /sanctum/csrf-cookie   → XSRF-TOKEN + <app>-session
 *   POST /login {email,password,remember}
 *        header X-XSRF-TOKEN (nilai cookie yang sudah di-urldecode)
 *               X-Requested-With: XMLHttpRequest
 *
 * Nama cookie sesi berbeda antar lingkungan (`hits-cms-session` di produksi,
 * `hits-cms-qa-session` di staging), jadi jangan pernah menuliskannya di kode —
 * seluruh Set-Cookie disimpan apa adanya.
 */

interface Jar {
  cookies: Map<string, string>;
  masuk: boolean;
  kedaluwarsa: number;
}

// Satu jar per proses. Cukup: proses Next berumur panjang dan pengiriman
// dijalankan berurutan oleh pekerja outbox, bukan paralel dari banyak permintaan.
const jar: Jar = { cookies: new Map(), masuk: false, kedaluwarsa: 0 };

const UMUR_SESI_MS = 60 * 60 * 1000; // dipaksa login ulang tiap jam, jauh di bawah umur cookie

export class TilawahError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'TilawahError';
  }
}

function konfigurasi(): { base: string; email: string; password: string } {
  const base = (process.env.TILAWAH_BASE_URL ?? '').replace(/\/$/, '');
  const email = process.env.TILAWAH_EMAIL ?? '';
  const password = process.env.TILAWAH_PASSWORD ?? '';
  if (!base || !email || !password) {
    throw new TilawahError(
      'TILAWAH_BASE_URL / TILAWAH_EMAIL / TILAWAH_PASSWORD belum diset',
      0
    );
  }
  return { base, email, password };
}

/** Apakah integrasi tilawah tersedia sama sekali (tanpa melempar). */
export function tilawahTerkonfigurasi(): boolean {
  return Boolean(
    process.env.TILAWAH_BASE_URL && process.env.TILAWAH_EMAIL && process.env.TILAWAH_PASSWORD
  );
}

function serapCookie(res: Response): void {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const pasangan = c.split(';')[0];
    const i = pasangan.indexOf('=');
    if (i <= 0) continue;
    jar.cookies.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim());
  }
}

function headerCookie(): string {
  return [...jar.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}

function xsrf(): string {
  const t = jar.cookies.get('XSRF-TOKEN');
  return t ? decodeURIComponent(t) : '';
}

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Galat jaringan sesaat terjadi cukup sering pada CMS ini — server kecil, dan
 * domainnya menyelesaikan ke NAT64 selain IPv4 sehingga sebagian percobaan
 * menggantung lalu putus. `fetch failed` semacam itu bukan penolakan CMS dan
 * tidak berarti mutasinya ditolak; mengulangnya aman karena setiap langkah
 * outbox memastikan hasilnya lewat pembacaan ulang.
 */
async function fetchUlet(url: string, init: RequestInit, percobaan = 3): Promise<Response> {
  let terakhir: unknown;
  for (let i = 0; i < percobaan; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      terakhir = e;
      if (i < percobaan - 1) await tunggu(400 * (i + 1));
    }
  }
  throw terakhir;
}

async function mentah(path: string, init: RequestInit = {}): Promise<Response> {
  const { base } = konfigurasi();
  const res = await fetchUlet(`${base}${path}`, {
    ...init,
    redirect: 'manual',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf(),
      Cookie: headerCookie(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  serapCookie(res);
  return res;
}

async function masuk(): Promise<void> {
  const { email, password } = konfigurasi();
  jar.cookies.clear();
  await mentah('/sanctum/csrf-cookie');
  const res = await mentah('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: false }),
  });
  if (res.status !== 200 && res.status !== 204 && res.status !== 302) {
    const teks = await res.text();
    throw new TilawahError(`login CMS tilawah gagal (${res.status})`, res.status, teks.slice(0, 300));
  }
  jar.masuk = true;
  jar.kedaluwarsa = Date.now() + UMUR_SESI_MS;
}

async function pastikanMasuk(): Promise<void> {
  if (!jar.masuk || Date.now() > jar.kedaluwarsa) await masuk();
}

/**
 * Sesi bisa mati kapan saja. Yang menandakannya bukan hanya 401/419 — CMS juga
 * membalas 302 ke /login?reason=expired, dan permintaan XHR bisa mendapat HTML
 * halaman login alih-alih JSON. Ketiganya diperlakukan sama: login ulang sekali,
 * lalu ulangi permintaan. Hanya sekali, supaya kredensial salah tidak berubah
 * menjadi perulangan tak berujung.
 */
function sesiMati(res: Response, teks: string): boolean {
  if (res.status === 401 || res.status === 419) return true;
  if (res.status === 302) {
    const lokasi = res.headers.get('location') ?? '';
    return lokasi.includes('/login');
  }
  const tipe = res.headers.get('content-type') ?? '';
  return !tipe.includes('json') && /<form|name="password"|reason=expired/i.test(teks);
}

async function panggil<T>(path: string, init: RequestInit = {}): Promise<T> {
  await pastikanMasuk();

  let res = await mentah(path, init);
  let teks = await res.text();

  if (sesiMati(res, teks)) {
    jar.masuk = false;
    await masuk();
    res = await mentah(path, init);
    teks = await res.text();
  }

  // CMS ini campuran: sebagian endpoint bergaya API dan membalas JSON, sebagian
  // lagi bergaya Inertia dan membalas REDIRECT setelah mutasi berhasil.
  // POST /api/users terbukti membalas 302 ke akar sambil tetap membuat akunnya.
  //
  // Memperlakukan redirect sebagai kegagalan itu berbahaya, bukan sekadar salah:
  // percobaan ulang akan membuat akun ganda, dan endpoint hapus CMS balas 500.
  // Jadi redirect dikembalikan sebagai penanda, dan pemanggil yang memastikan
  // hasilnya lewat pembacaan ulang.
  if (res.status >= 300 && res.status < 400) {
    return { __redirect: res.headers.get('location') ?? '' } as T;
  }

  let json: unknown;
  try {
    json = JSON.parse(teks);
  } catch {
    throw new TilawahError(
      `respons CMS tilawah bukan JSON (${res.status}) untuk ${path}`,
      res.status,
      teks.slice(0, 300)
    );
  }

  if (!res.ok) {
    const pesan =
      (json as { message?: string } | null)?.message ?? `permintaan gagal (${res.status})`;
    throw new TilawahError(`${pesan} — ${path}`, res.status, json);
  }
  return json as T;
}

/** Baca daftar dari amplop `{data:{<kunci>:[…]}}`; sebagian route menaruhnya di akar. */
function daftar<T>(amplop: TilawahEnvelope<Record<string, unknown>>, kunci: string): T[] {
  const dariData = amplop.data?.[kunci];
  if (Array.isArray(dariData)) return dariData as T[];
  const dariAkar = (amplop as unknown as Record<string, unknown>)[kunci];
  return Array.isArray(dariAkar) ? (dariAkar as T[]) : [];
}

export async function ambilPrograms(): Promise<TilawahProgram[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(
    '/api/programs?per_page=100&filters[status]=1'
  );
  return daftar<TilawahProgram>(j, 'programs');
}

export async function ambilBatches(programId: number): Promise<TilawahBatch[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(
    `/api/batches?page=1&per_page=100&sort_by=id&sort=desc&filters[program_id]=${programId}&keyword=`
  );
  return daftar<TilawahBatch>(j, 'batches');
}

export async function ambilLevels(): Promise<TilawahLevel[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(
    '/api/levels?page=1&per_page=200&sort_by=id&sort=asc&keyword='
  );
  return daftar<TilawahLevel>(j, 'levels');
}

export async function ambilDays(): Promise<TilawahDay[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>('/api/days?per_page=200');
  return daftar<TilawahDay>(j, 'days');
}

export async function ambilSessions(): Promise<TilawahSession[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>('/api/sessions?per_page=200');
  return daftar<TilawahSession>(j, 'sessions');
}

/** Cari guru pada satu batch, dipakai memetakan pengajar maahir → user_id CMS. */
export async function cariGuru(batchId: number, keyword: string): Promise<TilawahUser[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(
    `/api/users?filters[role]=guru&filters[batch_id]=${batchId}&page=1&per_page=50&sort_by=name&sort=asc&keyword=${encodeURIComponent(keyword)}`
  );
  return daftar<TilawahUser>(j, 'users');
}

export async function cariMurid(batchId: number, keyword: string): Promise<TilawahUser[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(
    `/api/users?filters[role]=murid&filters[batch_id]=${batchId}&page=1&per_page=50&sort_by=name&sort=asc&keyword=${encodeURIComponent(keyword)}`
  );
  return daftar<TilawahUser>(j, 'users');
}

/** Penanda bahwa CMS membalas redirect, bukan JSON. Lihat catatan di `panggil`. */
export interface ResponsRedirect {
  __redirect: string;
}

export function adalahRedirect(x: unknown): x is ResponsRedirect {
  return Boolean(x && typeof x === 'object' && '__redirect' in (x as Record<string, unknown>));
}

/**
 * Ambil id sumber daya dari respons tulis.
 *
 * Bentuknya tidak seragam dan ejaannya tidak dapat ditebak: daftar halaqah
 * memakai kunci `halaqohs`, detail satu halaqah memakai `halaqoh`, sedangkan
 * dokumentasi hasil reverse-engineering menyebut `halaqah`. Menebak satu nama
 * membuat pembuatan yang BERHASIL terbaca sebagai gagal — dan karena tidak ada
 * cara membatalkan, percobaan ulang menumpuk baris ganda di CMS.
 *
 * Karena itu id dicari, bukan diasumsikan: id di akar `data`, atau id pertama
 * pada objek anak mana pun.
 */
export function ambilIdBaru(respons: unknown): number | null {
  const data = (respons as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object') return null;

  const akar = (data as { id?: unknown }).id;
  if (typeof akar === 'number') return akar;

  for (const nilai of Object.values(data as Record<string, unknown>)) {
    if (nilai && typeof nilai === 'object' && !Array.isArray(nilai)) {
      const id = (nilai as { id?: unknown }).id;
      if (typeof id === 'number') return id;
    }
  }
  return null;
}

/**
 * Cari halaqah pada satu batch. Kunci daftarnya `halaqohs` — ejaan yang berbeda
 * dari `halaqoh` pada detail dan `halaqah` pada dokumentasi, jadi ketiganya dicoba.
 */
export async function cariHalaqah(batchId: number, keyword: string): Promise<TilawahHalaqah[]> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(
    `/api/halaqah?page=1&per_page=100&sort_by=id&sort=desc&simple=true&filters[batch_id]=${batchId}&keyword=${encodeURIComponent(keyword)}`
  );
  for (const kunci of ['halaqohs', 'halaqah', 'halaqahs']) {
    const d = daftar<TilawahHalaqah>(j, kunci);
    if (d.length > 0) return d;
  }
  return [];
}

/** Detail satu halaqah, termasuk `users[]` — dipakai memverifikasi enrolment. */
export async function ambilHalaqahDetail(id: number): Promise<{
  id: number;
  users: { id: number; pivot?: { type?: string } }[];
} | null> {
  const j = await panggil<TilawahEnvelope<Record<string, unknown>>>(`/api/halaqah/${id}`);
  const data = j.data ?? (j as unknown as Record<string, unknown>);
  for (const kunci of ['halaqoh', 'halaqah']) {
    const h = (data as Record<string, unknown>)[kunci];
    if (h && typeof h === 'object') {
      const users = ((h as { users?: unknown }).users ?? []) as {
        id: number;
        pivot?: { type?: string };
      }[];
      return { id: (h as { id: number }).id, users };
    }
  }
  return null;
}

/** POST JSON umum. Dipakai push.ts; dipisah supaya semua tulis lewat satu pintu. */
export async function kirim<T>(path: string, body: unknown): Promise<T> {
  return panggil<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Paksa login ulang — dipakai tombol uji koneksi di layar koordinator. */
export async function ujiKoneksi(): Promise<{ ok: true; programs: number }> {
  jar.masuk = false;
  const p = await ambilPrograms();
  return { ok: true, programs: p.length };
}
