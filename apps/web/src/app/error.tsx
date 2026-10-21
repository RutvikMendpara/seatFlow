'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">We couldn&apos;t load this page. Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 h-10 rounded-lg bg-accent px-5 font-medium text-accent-ink hover:bg-accent-strong"
      >
        Try again
      </button>
    </div>
  );
}
