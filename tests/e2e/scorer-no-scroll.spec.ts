import { expect, test } from '@playwright/test';

/**
 * THE GATE.
 *
 * docs/05-SCORER-VIEW.md § 3 promises the scoring screen scrolls zero pixels.
 * This test enforces that promise at every viewport we support. It runs on
 * every PR. If it fails, the layout is wrong — do not raise the budget.
 */

const SCORER_URL = '/matches/00000000-0000-0000-0000-000000000000/score';

test.describe('Scorer view — zero scroll', () => {
  test('the shell never overflows its own height', async ({ page }, testInfo) => {
    await page.goto(SCORER_URL);

    const shell = page.getByTestId('scoring-shell');
    await expect(shell).toBeVisible();

    const { scrollHeight, clientHeight } = await shell.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    expect(
      scrollHeight,
      `Scoring shell overflows by ${scrollHeight - clientHeight}px on ${testInfo.project.name}. ` +
        `The layout budget in docs/05-SCORER-VIEW.md § 1 has been exceeded.`
    ).toBeLessThanOrEqual(clientHeight);
  });

  test('the document itself does not scroll', async ({ page }) => {
    await page.goto(SCORER_URL);
    await expect(page.getByTestId('scoring-shell')).toBeVisible();

    const canScroll = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollBy(0, 400);
      const after = window.scrollY;
      window.scrollTo(0, before);
      return after !== before;
    });

    expect(canScroll, 'The scoring page scrolled — it must not.').toBe(false);
  });

  test('every run-pad button clears the 44px minimum touch target', async ({ page }) => {
    await page.goto(SCORER_URL);
    await expect(page.getByTestId('scoring-shell')).toBeVisible();

    const pads = page.locator('.panel').filter({ hasText: /^[0-9+]+$/ });
    const count = await pads.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const box = await pads.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
