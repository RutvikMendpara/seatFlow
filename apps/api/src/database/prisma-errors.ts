import { Prisma } from '../generated/prisma/client';

type AdapterMeta = {
  driverAdapterError?: {
    cause?: { originalCode?: string; constraint?: { index?: string } };
  };
};

function adapterCause(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  return (err.meta as AdapterMeta | undefined)?.driverAdapterError?.cause;
}

// With the pg adapter, the constraint name comes through on the driver error,
// for both model queries (P2002) and raw queries (P2010).
export function isUniqueViolation(err: unknown, constraint: string) {
  const cause = adapterCause(err);
  return cause?.originalCode === '23505' && cause.constraint?.index === constraint;
}

// P2028 covers both "couldn't get a connection in time" and "ran past the timeout".
export function isTransactionTimeout(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028';
}
