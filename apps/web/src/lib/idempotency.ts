// crypto.randomUUID only exists in secure contexts, so fall back for plain
// http on a LAN address during development.
export function idempotencyKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
