// Fungsi MURNI lifecycle tabayyun F3. Tanpa I/O — dipakai server action (guard)
// & UI (label tombol/badge). Diuji: npm run test-tabayyun.

export const TABAYYUN_DEADLINE_HOURS = 72;
const MS_PER_HOUR = 3_600_000;

export type TabayyunGhostingState =
  | 'not_reminded'    // pending, koordinator belum kirim reminder → jam belum jalan
  | 'awaiting_within' // pending, sudah diingatkan, now < deadline
  | 'ghosting'        // pending, sudah diingatkan, now >= deadline (tak respons 72h)
  | 'has_reason'      // pengajar sudah submit alasan (status awaiting_reason)
  | 'decided';        // sudah diputus koordinator

export interface TabayyunStateInput {
  status: string;
  reminder_sent_at: string | null;
  deadline_at: string | null;
}

export function tabayyunGhostingState(t: TabayyunStateInput, nowIso: string): TabayyunGhostingState {
  if (t.status === 'decided') return 'decided';
  if (t.status === 'awaiting_reason') return 'has_reason';
  // status 'pending' (belum ada alasan)
  if (!t.reminder_sent_at) return 'not_reminded';
  if (!t.deadline_at) return 'awaiting_within';
  const now = new Date(nowIso).getTime();
  const deadline = new Date(t.deadline_at).getTime();
  return now >= deadline ? 'ghosting' : 'awaiting_within';
}

/** Sisa jam menuju deadline (negatif = sudah lewat). Null bila belum diingatkan. */
export function tabayyunHoursLeft(t: TabayyunStateInput, nowIso: string): number | null {
  if (!t.reminder_sent_at || !t.deadline_at) return null;
  return (new Date(t.deadline_at).getTime() - new Date(nowIso).getTime()) / MS_PER_HOUR;
}

/** Deadline ISO = reminder_sent_at + 72 jam (kalibrasi jam, bukan hari kalender). */
export function deadlineFromReminder(reminderIso: string): string {
  return new Date(new Date(reminderIso).getTime() + TABAYYUN_DEADLINE_HOURS * MS_PER_HOUR).toISOString();
}
