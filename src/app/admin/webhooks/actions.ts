'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import {
  createEndpoint,
  setEndpointActive,
  deleteEndpoint,
} from '@/lib/webhooks';

export interface CreateEpResult {
  ok: boolean;
  secret?: string;
  id?: string;
  error?: string;
}

export async function createEndpointAction(formData: FormData): Promise<CreateEpResult> {
  const { wa } = await requireAdmin();
  try {
    const url = String(formData.get('url') ?? '');
    const events = formData.getAll('events').map(String);
    const note = String(formData.get('note') ?? '').trim();
    const { endpoint, secret } = await createEndpoint({
      url,
      events,
      note: note || null,
      createdByWa: wa,
    });
    revalidatePath('/admin/webhooks');
    return { ok: true, secret, id: endpoint.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setActiveAction(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await setEndpointActive(id, active);
  revalidatePath('/admin/webhooks');
}

export async function deleteEndpointAction(id: string): Promise<void> {
  await requireAdmin();
  await deleteEndpoint(id);
  revalidatePath('/admin/webhooks');
}
