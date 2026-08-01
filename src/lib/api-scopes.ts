// Scope untuk Public Read API (/api/v1). Membatasi resource yang boleh dibaca
// tiap konsumen. READ-ONLY — tak ada scope write.
export const API_SCOPES = ['master:read', 'setoran:read', 'hits:read'] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABEL: Record<ApiScope, string> = {
  'master:read': 'Master data (peserta, kelas, pengajar, dll)',
  'setoran:read': 'Setoran Maahir & laporan bulanan',
  'hits:read': 'HITS rekap, ranking, kehadiran',
};

export function isApiScope(s: string): s is ApiScope {
  return (API_SCOPES as readonly string[]).includes(s);
}

/** Saring daftar string → hanya scope valid (buang duplikat). */
export function normalizeScopes(input: string[]): ApiScope[] {
  const out = new Set<ApiScope>();
  for (const s of input) {
    const t = s.trim();
    if (isApiScope(t)) out.add(t);
  }
  return [...out];
}

export function hasScope(granted: string[], needed: ApiScope): boolean {
  return granted.includes(needed);
}
