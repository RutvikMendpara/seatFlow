import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-ink-muted">That movie or show doesn&apos;t exist anymore.</p>
      <Link href="/" className="mt-6 inline-block font-medium text-accent-strong hover:underline">
        Back to movies
      </Link>
    </div>
  );
}
