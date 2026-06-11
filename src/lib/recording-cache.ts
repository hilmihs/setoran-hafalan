import type { JenisRekaman } from '@/types/db';

const DB_NAME = 'maahir-recordings';
const STORE = 'cache';
const DB_VERSION = 1;

interface CacheEntry {
  key: string;
  blob: Blob;
  durationSec: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(
  weekStart: string,
  jenis: string,
  blob: Blob,
  durationSec: number
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const entry: CacheEntry = { key: `${weekStart}/${jenis}`, blob, durationSec };
      const req = tx.objectStore(STORE).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB unavailable (private browsing, quota exceeded) — silent fail
  }
}

export async function deleteRecording(weekStart: string, jenis: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(`${weekStart}/${jenis}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // silent fail
  }
}

export async function loadRecordings(
  weekStart: string
): Promise<Partial<Record<JenisRekaman, { blob: Blob; durationSec: number }>>> {
  try {
    const db = await openDb();
    const jenisRekaman: JenisRekaman[] = ['tuhfatul_athfal', 'jazariyyah', 'syawahid'];
    const results = await Promise.all(
      jenisRekaman.map((jenis) =>
        new Promise<CacheEntry | undefined>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(`${weekStart}/${jenis}`);
          req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
          req.onerror = () => reject(req.error);
        })
      )
    );
    const out: Partial<Record<JenisRekaman, { blob: Blob; durationSec: number }>> = {};
    jenisRekaman.forEach((jenis, i) => {
      const entry = results[i];
      if (entry) out[jenis] = { blob: entry.blob, durationSec: entry.durationSec };
    });
    return out;
  } catch {
    return {};
  }
}

export async function clearRecordings(weekStart: string): Promise<void> {
  try {
    const db = await openDb();
    const jenisRekaman: JenisRekaman[] = ['tuhfatul_athfal', 'jazariyyah', 'syawahid'];
    await Promise.all(
      jenisRekaman.map((jenis) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(`${weekStart}/${jenis}`);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve(); // silent fail per entry
        })
      )
    );
  } catch {
    // silent fail
  }
}
