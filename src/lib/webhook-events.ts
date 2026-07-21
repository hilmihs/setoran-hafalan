// Katalog event webhook. Konsumen berlangganan sebagian/semua event ini.
export const WEBHOOK_EVENTS = [
  'setoran.submitted', // peserta submit setoran (3 rekaman lengkap)
  'setoran.checked', // musyrif memberi nilai → setoran terkunci
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  'setoran.submitted': 'Setoran disubmit peserta',
  'setoran.checked': 'Setoran dinilai musyrif',
};

export function isWebhookEvent(s: string): s is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(s);
}

export function normalizeEvents(input: string[]): WebhookEvent[] {
  const out = new Set<WebhookEvent>();
  for (const e of input) {
    const t = e.trim();
    if (isWebhookEvent(t)) out.add(t);
  }
  return [...out];
}
