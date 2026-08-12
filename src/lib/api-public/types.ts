// types.ts — tipe bersama jalur API publik.
export type ScopeName = 'maahir' | 'hits' | 'penilaian' | 'ref' | 'shakwa';

export type FilterKind = 'eq' | 'bool' | 'date_from' | 'date_to' | 'since' | 'is_null';

export interface FilterDef {
  /** nama param di query-string, mis. 'gender' */
  param: string;
  /** kolom DB yang difilter, mis. 'gender' */
  column: string;
  kind: FilterKind;
}

export interface EntityDef {
  /** segmen route setelah /api/v1/, mis. 'peserta' atau 'hits/batch' */
  route: string;
  table: string;
  scope: ScopeName;
  /** kolom yang keluar — WAJIB eksplisit, tak ada '*' */
  columns: string[];
  filters: FilterDef[];
  /** kolom + arah urutan default */
  order: { column: string; dir: 'asc' | 'desc' };
  /** true = boleh dibaca semua key terautentikasi (referensi orang), lepas dari scope. */
  refShared?: boolean;
}

export interface AuthClient {
  id: string;
  nama: string;
  scopes: ScopeName[];
}

export type AuthResult =
  | { ok: true; client: AuthClient }
  | { ok: false; status: number; code: string; message: string };

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  has_more?: boolean;
  dari_cache: boolean;
  umur_detik: number;
  [k: string]: unknown;
}
