import Link from 'next/link';

type Props = {
  href: string;
  active: boolean;
  children: React.ReactNode;
};

export function ChipLink({ href, active, children }: Props) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors ${
        active
          ? 'border-accent bg-accent-soft font-medium text-accent-strong'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}
