import { expect, test } from '@playwright/test';

test.describe('Phase 0 smoke', () => {
  test('home renders and the app shell is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('CricLife').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('theme toggle switches between dark and light', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the chosen theme survives a reload with no flash of the wrong theme', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    // The blocking script in index.html must have set this before first paint.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('accent colour persists', async ({ page }) => {
    await page.goto('/settings/appearance');
    await page.getByRole('button', { name: 'violet' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  });

  test('an unknown route lands on 404', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await expect(page.getByText('Played and missed')).toBeVisible();
  });

  test('the audience route is reachable without signing in', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/live/some-match-slug');
    await expect(page.getByText('Live match')).toBeVisible();
  });
});
