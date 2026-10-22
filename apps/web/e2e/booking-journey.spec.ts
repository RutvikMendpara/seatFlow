import { expect, test } from '@playwright/test';
import { findShow, newEmail, PASSWORD, payOnSimulator, seatButton } from './helpers';

test('books two seats from the movie page to the ticket', async ({ page, request }) => {
  const { showtimeId, seats } = await findShow(request, 2);
  const [first, second] = seats;

  await page.goto(`/showtimes/${showtimeId}`);
  await expect(page.getByText('Live')).toBeVisible();
  // The seat map scrolls inside its own box. The page itself never should.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Pick the first seat with the mouse and the next one with the keyboard.
  await seatButton(page, first!).click();
  await expect(seatButton(page, first!)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(seatButton(page, second!)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('2 seats ·')).toBeVisible();

  // Signed out, so continuing goes through sign up and back.
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill(newEmail());
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(new RegExp(`/showtimes/${showtimeId}`));
  await expect(seatButton(page, first!)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/checkout\//);
  await expect(page.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^\d+:\d{2}$/);
  await expect(page.getByText(`Seats: ${first!.label}, ${second!.label}`)).toBeVisible();
  await page.getByRole('button', { name: 'Pay now' }).click();

  await payOnSimulator(page, 'pay');
  await expect(page).toHaveURL(/\/bookings\/SF-[A-Z0-9]{8}\?new=1/);
  await expect(page.getByText("You're all set!")).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code for booking SF-/ })).toBeVisible();
  await expect(page.getByText(`${first!.label}, ${second!.label}`)).toBeVisible();

  await page.getByRole('link', { name: 'My bookings' }).click();
  await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
});
