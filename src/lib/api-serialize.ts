// Serialisasi baris DB → aman untuk keluar via Public Read API.
//
// BLACKLIST KERAS: field sensitif ini SELALU dibuang dari SEMUA resource,
// apa pun scope-nya. Non-negotiable (kredensial / token).
//   - password_hash          (bcrypt hash login)
//   - magic_token            (auto-login ketua_kelas)
//   - reset_token / *_token  (token reset password)
//
// whatsapp_number: DITERUSKAN penuh (keputusan produk).
// audio_url: dibuang di serializer rekaman (audio = metadata saja, tanpa file).

const HARD_BLACKLIST = new Set(['password_hash', 'magic_token', 'reset_token']);

function isSensitiveKey(key: string): boolean {
  if (HARD_BLACKLIST.has(key)) return true;
  // Tangkap turunan: *_token, *password* (kecuali murni non-kredensial jarang).
  if (/(_|^)token$/i.test(key)) return true;
  if (/password/i.test(key)) return true;
  return false;
}

type Row = Record<string, unknown>;

/** Buang field sensitif dari satu baris (shallow). */
export function sanitizeRow<T extends Row>(row: T): Partial<T> {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (isSensitiveKey(k)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export function sanitizeRows<T extends Row>(rows: T[]): Partial<T>[] {
  return rows.map(sanitizeRow);
}

/**
 * Rekaman → metadata saja. Buang audio_url + field sensitif. Sisakan
 * info yang berguna: jenis, durasi, nilai, waktu.
 */
export function serializeRekaman(row: Row): Row {
  const clean = sanitizeRow(row);
  delete (clean as Row).audio_url;
  return clean as Row;
}
