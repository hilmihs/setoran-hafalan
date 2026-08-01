'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import {
  createApiKey,
  revokeApiKey,
  activateApiKey,
  updateApiKeyScopes,
} from '@/lib/api-keys';

// Server actions kelola API key — semua di-guard requireAdmin (superadmin).

export interface CreateResult {
  ok: boolean;
  fullKey?: string;
  prefix?: string;
  error?: string;
}

export async function createKeyAction(formData: FormData): Promise<CreateResult> {
  const { wa } = await requireAdmin();
  try {
    const name = String(formData.get('name') ?? '');
    const scopes = formData.getAll('scopes').map(String);
    const expiresRaw = String(formData.get('expires_at') ?? '').trim();
    const note = String(formData.get('note') ?? '').trim();
    const res = await createApiKey({
      name,
      scopes,
      expiresAt: expiresRaw ? new Date(expiresRaw).toISOString() : null,
      createdByWa: wa,
      note: note || null,
    });
    revalidatePath('/admin/api-keys');
    return { ok: true, fullKey: res.fullKey, prefix: res.row.key_prefix };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeKeyAction(id: string): Promise<void> {
  await requireAdmin();
  await revokeApiKey(id);
  revalidatePath('/admin/api-keys');
}

export async function activateKeyAction(id: string): Promise<void> {
  await requireAdmin();
  await activateApiKey(id);
  revalidatePath('/admin/api-keys');
}

export async function updateScopesAction(id: string, scopes: string[]): Promise<void> {
  await requireAdmin();
  await updateApiKeyScopes(id, scopes);
  revalidatePath('/admin/api-keys');
}
