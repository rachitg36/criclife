import { expect, test } from '@playwright/test';

test.describe('Phase 0 smoke', () => {
  // `/` is `authed` per docs/11-SCREENS-AND-ROUTES.md § 2 — Phase 2 wired
  // real `RequireAuth`, so an anonymous visit now redirects to /login instead
  // of rendering the home shell directly.
  test('home redirects an anonymous visitor to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('CricLife').first()).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  });

  // The theme toggle only lives on Home and /settings/appearance
  // (docs/11 § 2, § 9), both `authed` routes. Exercising the toggle now needs
  // a real signed-in session, which needs a live Supabase project — one of
  // the "needs a human" setup steps in CLAUDE.md, not yet provisioned. Skipped
  // until that exists; see HANDOFF.md.
  test.skip('theme toggle switches between dark and light', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test.skip('the chosen theme survives a reload with no flash of the wrong theme', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    // The blocking script in index.html must have set this before first paint.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test.skip('accent colour persists', async ({ page }) => {
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

  // Phase 7 replaced the `<Placeholder>` this used to assert on with the real
  // audience view, so the old "Live match" text is gone. The point of the test
  // is unchanged and still worth gating: `/live/:publicSlug` must render for
  // someone with no session, rather than bouncing them to /login the way every
  // `authed` route does.
  //
  // What it renders here is the not-found or the error state, because a slug
  // that doesn't exist is exactly what this asks for — and because this sandbox
  // has no route to a real Supabase project either way (HANDOFF.md § 5.1). Both
  // are audience-view states; neither is a login page, which is the assertion.
  test('the audience route is reachable without signing in', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/live/some-match-slug');

    await expect(
      page.getByRole('heading', { name: /No such match|Couldn't load this match/ })
    ).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/live/some-match-slug');
  });
});
