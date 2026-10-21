const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4100),
  // Where browsers reach the hosted checkout page.
  publicUrl: env.PUBLIC_URL ?? 'http://localhost:4100',
  apiKey: env.SIM_API_KEY ?? 'sk_test_seatflow',
  webhookUrl: env.WEBHOOK_URL ?? 'http://localhost:4000/api/payments/webhooks',
  webhookSecret: env.WEBHOOK_SECRET ?? 'whsec_test_seatflow',
  // How long the "deliver late" option waits before sending the webhook.
  lateWebhookDelayMs: Number(env.LATE_WEBHOOK_DELAY_MS ?? 20_000),
};
