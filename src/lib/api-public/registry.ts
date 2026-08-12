// registry.ts — deklarasi entitas + daftar kolom terlarang + audit saat modul dimuat.
import type { EntityDef } from './types';

export const FORBIDDEN_COLUMNS: string[] = [
  'password_hash',
  'whatsapp_number', 'ketua_wa', 'wakil_wa',
  'magic_token',
  'new_password_plaintext',
  'token',
  'audio_url',
  'masukan', 'ket_bacaan', 'ket_hafalan', 'catatan_umum',
];

/** Lempar bila ada entitas menyebut kolom terlarang. Dipanggil saat modul dimuat. */
export function auditEntities(entities: Record<string, EntityDef>): void {
  for (const [key, def] of Object.entries(entities)) {
    for (const col of def.columns) {
      if (FORBIDDEN_COLUMNS.includes(col)) {
        throw new Error(`[api registry] entitas '${key}' menyebut kolom terlarang '${col}'`);
      }
    }
  }
}

export const ENTITIES: Record<string, EntityDef> = {
  // diisi di Phase 3–5
};

auditEntities(ENTITIES);

export function getEntity(route: string): EntityDef | null {
  return ENTITIES[route] ?? null;
}
