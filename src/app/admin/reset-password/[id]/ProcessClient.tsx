'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { acceptResetRequest, declineResetRequest } from './actions';

interface RequestSummary {
  id: string;
  whatsapp_number: string;
  requester_name: string | null;
  created_at: string;
}

export function ProcessClient({ request }: { request: RequestSummary }) {
  const [acceptState, acceptAction] = useFormState(acceptResetRequest, undefined);
  const [declineState, declineAction] = useFormState(declineResetRequest, undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (acceptState?.waMeUrl) {
      window.open(acceptState.waMeUrl, '_blank', 'noopener,noreferrer');
    }
  }, [acceptState?.waMeUrl]);

  // Setelah accept sukses: tampilkan password + tombol kirim WA.
  if (acceptState?.password && acceptState?.waMeUrl) {
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(acceptState.password!);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="banner banner-success">
          <div>
            <div className="title">Password baru berhasil dibuat</div>
            <div className="desc">
              Hash di semua tabel role pemohon sudah disinkron. Kirim password ini ke pemohon via WhatsApp.
            </div>
          </div>
        </div>

        <div>
          <label className="field-label">Password sementara</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              value={acceptState.password}
              readOnly
              style={{ fontFamily: 'var(--font-mono), monospace', letterSpacing: 1 }}
            />
            <button type="button" onClick={handleCopy} className="btn btn-ghost" style={{ flexShrink: 0 }}>
              {copied ? '✓' : 'Salin'}
            </button>
          </div>
          <p className="t-small" style={{ color: 'var(--muted)', marginTop: 6 }}>
            Password ini hanya muncul sekali. Pastikan tersalin atau langsung dikirim sebelum tutup halaman.
          </p>
        </div>

        <a
          href={acceptState.waMeUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-block btn-primary"
        >
          Kirim ke {request.requester_name ?? 'pemohon'} via WhatsApp
        </a>
      </div>
    );
  }

  if (declineState?.ok) {
    return (
      <div className="banner banner-success">
        <div>
          <div className="title">Permintaan ditolak</div>
          <div className="desc">Tidak ada perubahan password. Pemohon tetap pakai password lama.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="field-label">Pemohon</div>
        <div className="t-body" style={{ fontWeight: 600 }}>{request.requester_name ?? '—'}</div>
      </div>
      <div>
        <div className="field-label">Nomor WhatsApp</div>
        <div className="t-body" style={{ fontFamily: 'var(--font-mono), monospace' }}>{request.whatsapp_number}</div>
      </div>
      <div>
        <div className="field-label">Diajukan</div>
        <div className="t-body">{new Date(request.created_at).toLocaleString('id-ID')}</div>
      </div>

      {(acceptState?.error || declineState?.error) && (
        <div className="banner banner-error">
          <div>
            <div className="title">Gagal</div>
            <div className="desc">{acceptState?.error ?? declineState?.error}</div>
          </div>
        </div>
      )}

      <form action={acceptAction}>
        <input type="hidden" name="id" value={request.id} />
        <AcceptBtn />
      </form>
      <form action={declineAction}>
        <input type="hidden" name="id" value={request.id} />
        <DeclineBtn />
      </form>
    </div>
  );
}

function AcceptBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-block btn-primary">
      {pending ? 'Memproses…' : 'Accept — generate password baru'}
    </button>
  );
}

function DeclineBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-block btn-ghost">
      {pending ? 'Memproses…' : 'Decline'}
    </button>
  );
}
