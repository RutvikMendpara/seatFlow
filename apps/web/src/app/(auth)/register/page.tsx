import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function Page() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
      <p className="mt-1 mb-6 text-ink-muted">You need an account to book seats.</p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </div>
  );
}
