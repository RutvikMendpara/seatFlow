import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  HOLD_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  // Extra time the seats stay held once the user goes to pay.
  PAYMENT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  PAYMENT_PROVIDER_URL: z.url(),
  PAYMENT_API_KEY: z.string().min(8),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  // Where the provider sends the customer back to after paying.
  WEB_URL: z.url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
