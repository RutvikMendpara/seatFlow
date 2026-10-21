import { TEST_DATABASE_URL } from './test-env';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER_URL = 'http://payments.invalid';
process.env.PAYMENT_API_KEY = 'sk_test_unit';
process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test_for_e2e_tests';
process.env.RECONCILE_GRACE_SECONDS = '5';
process.env.TICKET_SIGNING_SECRET = 'ticket-secret-used-only-in-the-e2e-tests';
