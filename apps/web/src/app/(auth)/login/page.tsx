import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-ink-muted">Sign in to book seats and see your tickets.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
