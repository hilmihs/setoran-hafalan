'use client';

import { useTransition, useState } from 'react';
import { decideAlasan } from './actions';

export function DecisionButtons({ pengajuanId }: { pengajuanId: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="t-small" style={{ color: 'var(--success, #4caf50)', fontWeight: 600 }}>
        Keputusan tersimpan.
      </p>
    );
  }

  function handleDecision(decision: 'accepted' | 'rejected') {
    setError(null);
    const fd = new FormData();
    fd.set('pengajuan_id', pengajuanId);
    fd.set('decision', decision);
    startTransition(async () => {
      const result = await decideAlasan(undefined, fd);
      if (result?.error) setError(result.error);
      if (result?.ok) setDone(true);
    });
  }

  return (
    <div>
      {error && (
        <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 4 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleDecision('accepted')}
          disabled={pending}
          className="btn"
          style={{ flex: 1, fontSize: 13, padding: '8px 12px', background: 'var(--success, #4caf50)' }}
        >
          Terima
        </button>
        <button
          onClick={() => handleDecision('rejected')}
          disabled={pending}
          className="btn"
          style={{ flex: 1, fontSize: 13, padding: '8px 12px', background: 'var(--danger, #f44336)' }}
        >
          Tolak
        </button>
      </div>
    </div>
  );
}
