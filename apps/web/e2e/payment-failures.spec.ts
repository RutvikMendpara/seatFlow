import { expect, test } from '@playwright/test';
import { findShow, payOnSimulator, seatButton, signUp } from './helpers';

test.beforeEach(async ({ page }) => {
  await signUp(page);
});

async function goToCheckout(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  const { showtimeId, seats } = await findShow(request, 1);
  await page.goto(`/showtimes/${showtimeId}`);
  await seatButton(page, seats[0]!).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/checkout\//);
}

test('a declined payment can be retried', async ({ page, request }) => {
  await goToCheckout(page, request);
  await page.getByRole('button', { name: 'Pay now' }).click();
  await payOnSimulator(page, 'decline');

  await expect(page.getByRole('heading', { name: "Payment didn't go through" })).toBeVisible();
  await expect(page.getByText('Your bank declined the payment.')).toBeVisible();

  await page.getByRole('button', { name: 'Try paying again' }).click();
  await payOnSimulator(page, 'pay');
  await expect(page).toHaveURL(/\/bookings\/SF-/);
});

test('waits for a late webhook instead of trusting the redirect', async ({ page, request }) => {
  await goToCheckout(page, request);
  await page.getByRole('button', { name: 'Pay now' }).click();
  await payOnSimulator(page, 'pay', 'late');

  // Back on our site before the provider has told us anything.
  await expect(page.getByRole('heading', { name: 'Confirming your payment…' })).toBeVisible();
  await expect(page).toHaveURL(/\/bookings\/SF-/, { timeout: 45_000 });
});

test('changing seats releases the hold', async ({ page, request }) => {
  await goToCheckout(page, request);
  const checkoutUrl = page.url();
  await page.getByRole('button', { name: 'Change seats' }).click();
  await expect(page).toHaveURL(/\/showtimes\/.+\?seats=/);

  await page.goto(checkoutUrl);
  await expect(page.getByText('You released these seats')).toBeVisible();
});
