'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { submitCek, type CekResult } from '@/app/musyrif/cek/[id]/actions';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';

export interface RekamanView {
  jenis: JenisRekaman;
  audioUrl: string | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
}

export function CekForm({
  setoranId,
  rekamanList,
  alreadyChecked,
}: {
  setoranId: string;
  rekamanList: RekamanView[];
  alreadyChecked: boolean;
}) {
  const [state, formAction] = useFormState<CekResult | undefined, FormData>(
    submitCek,
    undefined
  );

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <h2 className="font-semibold text-green-900">Pemeriksaan tersimpan.</h2>
          <p className="text-sm text-green-800 mt-1">
            Tap tombol di bawah untuk meneruskan hasil ke peserta via WhatsApp.
          </p>
        </div>
        <a
          href={state.waUrl}
          target="_blank"
          rel="noopener"
          className="block text-center py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          Kirim hasil ke peserta
        </a>
        <a
          href="/musyrif"
          className="block text-center py-2 px-4 text-sm text-stone-600 hover:text-stone-800"
        >
          Kembali ke dashboard
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="setoran_id" value={setoranId} />
      {rekamanList.map((r) => (
        <fieldset
          key={r.jenis}
          className="border border-stone-200 rounded-lg p-4 space-y-3 bg-white"
        >
          <legend className="font-medium text-stone-800 px-1">
            {JENIS_REKAMAN_LABEL[r.jenis]}
          </legend>
          {r.audioUrl ? (
            <audio src={r.audioUrl} controls className="w-full" />
          ) : (
            <p className="text-sm text-stone-500 italic">
              (audio tidak tersedia — sudah dihapus dari arsip)
            </p>
          )}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-700">
              Nilai
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['hijau', 'kuning', 'merah'] as NilaiRekaman[]).map((n) => (
                <label
                  key={n}
                  className={`block text-center py-2 px-3 rounded border cursor-pointer text-sm ${nilaiClass(n)}`}
                >
                  <input
                    type="radio"
                    name={`nilai_${r.jenis}`}
                    value={n}
                    defaultChecked={r.nilai === n}
                    required
                    disabled={alreadyChecked}
                    className="sr-only peer"
                  />
                  <span className="peer-checked:font-semibold peer-checked:underline">
                    {capitalize(n)}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Masukan</span>
            <textarea
              name={`masukan_${r.jenis}`}
              defaultValue={r.masukan ?? ''}
              disabled={alreadyChecked}
              rows={2}
              placeholder="Catatan untuk peserta…"
              className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-50"
            />
          </label>
        </fieldset>
      ))}

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {state.error}
        </p>
      )}

      {alreadyChecked ? (
        <p className="text-sm text-stone-600 italic">
          Setoran ini sudah dicek dan tidak bisa diubah.
        </p>
      ) : (
        <SubmitButton />
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 px-4 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 font-medium"
    >
      {pending ? 'Menyimpan…' : 'Simpan Pemeriksaan'}
    </button>
  );
}

function nilaiClass(n: NilaiRekaman): string {
  switch (n) {
    case 'hijau':
      return 'border-green-300 bg-green-50 hover:bg-green-100';
    case 'kuning':
      return 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100';
    case 'merah':
      return 'border-red-300 bg-red-50 hover:bg-red-100';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
