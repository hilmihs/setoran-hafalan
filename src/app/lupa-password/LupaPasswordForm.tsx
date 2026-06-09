'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { requestPasswordReset } from './actions';

export function LupaPasswordForm() {
  const [state, formAction] = useFormState(requestPasswordReset, undefined);

  useEffect(() => {
    if (state?.waMeUrl) {
      window.open(state.waMeUrl, '_blank');
    }
  }, [state?.waMeUrl]);

  if (state?.waMeUrl) {
    return (
      <div className="banner banner-success" style={{ marginTop: 12 }}>
        <div>
          <div className="title">Permintaan terkirim</div>
          <div className="desc">
            WhatsApp ke Technical Support sudah dibuka di tab baru. Tap tombol kirim di WhatsApp untuk meneruskan permintaan. Anda akan menerima password baru via WA setelah disetujui.
          </div>
          <div style={{ marginTop: 10 }}>
            <a href={state.waMeUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-block">
              Buka WhatsApp lagi
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label className="field-label" htmlFor="lupa_whatsapp_number">Nomor WhatsApp Anda</label>
        <input
          id="lupa_whatsapp_number"
          className="input"
          name="whatsapp_number"
          type="tel"
          autoComplete="tel"
          required
          placeholder="08xxxxxxxxxx"
        />
        <p className="t-small" style={{ color: 'var(--muted)', marginTop: 6 }}>
          Pakai nomor yang sama dengan saat login.
        </p>
      </div>
      {state?.error && (
        <div className="banner banner-error">
          <div>
            <div className="title">Gagal</div>
            <div className="desc">{state.error}</div>
          </div>
        </div>
      )}
      <SubmitBtn />
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-block btn-primary"
      style={{ marginTop: 6 }}
    >
      {pending ? 'Memproses…' : 'Kirim Permintaan'}
    </button>
  );
}
