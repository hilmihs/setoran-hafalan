'use client';

import { useState, useTransition } from 'react';
import { reminderKetuaKelas, reminderPengajarCheckin } from './actions';

interface Props {
  type: 'ketua_kelas' | 'pengajar';
  targetId: string;
  kelasName: string;
  label?: string;
}

export function ReminderButton({ type, targetId, kelasName, label }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result =
        type === 'ketua_kelas'
          ? await reminderKetuaKelas(targetId, kelasName)
          : await reminderPengajarCheckin(targetId, kelasName);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.waUrl) {
        window.open(result.waUrl, '_blank');
      }
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className="act-btn wa"
        style={{ fontSize: 11 }}
      >
        {pending ? '...' : label ?? 'Reminder'}
      </button>
      {error && <span className="t-small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
