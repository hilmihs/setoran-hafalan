'use client';

import { useFormState, useFormStatus } from 'react-dom';

type Action = (
  prev: { error?: string } | undefined,
  formData: FormData
) => Promise<{ error?: string } | undefined>;

export function LoginForm({
  action,
  title,
}: {
  action: Action;
  title: string;
}) {
  const [state, formAction] = useFormState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
      <label className="block">
        <span className="text-sm font-medium text-stone-700">Nomor WhatsApp</span>
        <input
          name="whatsapp_number"
          type="tel"
          autoComplete="username"
          required
          placeholder="08xxxxxxxxxx"
          className="mt-1 block w-full rounded border border-stone-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-stone-700">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded border border-stone-300 px-3 py-2"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {state.error}
        </p>
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
      className="w-full py-2 px-4 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50"
    >
      {pending ? 'Memproses…' : 'Login'}
    </button>
  );
}
