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

// SQLSTATE codes and driver messages for a connection that went away:
// admin shutdown, crash shutdown, cannot connect now, connection failures.
const CONNECTION_LOST_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006']);
const CONNECTION_LOST_MESSAGE =
  /terminating connection|Connection terminated|ECONNRESET|ECONNREFUSED|Client has encountered a connection error|server closed the connection/i;

export function isConnectionLost(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (['P1001', 'P1002', 'P1008', 'P1017'].includes(err.code)) return true;
    if (CONNECTION_LOST_CODES.has(adapterCause(err)?.originalCode ?? '')) return true;
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Error) {
    return CONNECTION_LOST_MESSAGE.test(err.message);
  }
  return false;
}
