'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { callApi, safeNext } from '@/lib/client-api';

type Mode = 'login' | 'register';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const body = Object.fromEntries(form.entries());
    const res = await callApi(`/auth/${mode}`, { method: 'POST', body });
    if (!res.ok) {
      setError(res.message);
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  const otherHref = `/${mode === 'login' ? 'register' : 'login'}?next=${encodeURIComponent(next)}`;
  const field =
    'mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 aria-[invalid=true]:border-accent';

  return (
    <form action={submit} className="space-y-4" aria-describedby={error ? errorId : undefined}>
      {mode === 'register' && (
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input id="name" name="name" required maxLength={100} autoComplete="name" className={field} />
        </div>
      )}
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={Boolean(error)}
          className={field}
        />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          aria-invalid={Boolean(error)}
          aria-describedby={mode === 'register' ? 'password-hint' : undefined}
          className={field}
        />
        {mode === 'register' && (
          <p id="password-hint" className="mt-1 text-sm text-ink-subtle">
            At least 8 characters.
          </p>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-lg bg-accent font-medium text-accent-ink hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>

      <p className="text-center text-sm text-ink-muted">
        {mode === 'login' ? 'New here? ' : 'Already have an account? '}
        <Link href={otherHref} className="font-medium text-accent-strong hover:underline">
          {mode === 'login' ? 'Create an account' : 'Sign in'}
        </Link>
      </p>
    </form>
  );
}
