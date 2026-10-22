'use client';

import { useRouter } from 'next/navigation';
import { callApi } from '@/lib/client-api';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await callApi('/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
      }}
      className="text-sm font-medium text-ink-muted hover:text-ink"
    >
      Sign out
    </button>
  );
}
