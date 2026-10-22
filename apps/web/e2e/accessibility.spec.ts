import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { findShow, seatButton, signUp } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}

test('home page', async ({ page }) => {
  await page.goto('/');
  await expectNoViolations(page);
});

test('movie page', async ({ page }) => {
  await page.goto('/movies/orbit-nine');
  await expectNoViolations(page);
});

test('seat map and checkout', async ({ page, request }) => {
  await signUp(page);
  const { showtimeId, seats } = await findShow(request, 1);
  await page.goto(`/showtimes/${showtimeId}`);
  await seatButton(page, seats[0]!).click();
  await expectNoViolations(page);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/checkout\//);
  await expectNoViolations(page);

  await page.getByRole('button', { name: 'Change seats' }).click();
  await expect(page).toHaveURL(/\/showtimes\//);
});

test('sign in page', async ({ page }) => {
  await page.goto('/login');
  await expectNoViolations(page);
});
