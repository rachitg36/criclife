import { expect, test } from '@playwright/test';

/**
 * Horizontal overflow gate.
 *
 * A phone-first app must never push content sideways out of view. Note that
 * "does the document scroll horizontally?" is NOT a sufficient assertion: an
 * ancestor with `overflow: hidden` silently clips the overflow, so
 * scrollWidth === clientWidth even while content is unreachable off-screen.
 * That is exactly how the home page shipped with 437px cards in a 375px
 * viewport — the P4/P3 badges sat at x=403, invisible, and every existing
 * test passed.
 *
 * So we assert on geometry instead: nothing that carries content may extend
 * past the viewport. Decorative elements (`aria-hidden`, e.g. the Aurora
 * blur) are exempt — they are deliberately oversized and clipped.
 */

const ROUTES = [
  { name: 'home', url: '/' },
  { name: 'appearance settings', url: '/settings/appearance' },
  { name: 'audience', url: '/live/some-match-slug' },
  { name: 'scorer', url: '/matches/00000000-0000-0000-0000-000000000000/score' },
];

for (const route of ROUTES) {
  test(`${route.name} keeps all content inside the viewport`, async ({ page }, testInfo) => {
    await page.goto(route.url);
    // Wait for first paint of real content rather than a fixed timeout.
    await expect(page.locator('body')).not.toBeEmpty();

    const offenders = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const TOLERANCE = 1; // subpixel rounding
      const bad: { tag: string; cls: string; left: number; right: number; text: string }[] = [];

      document.querySelectorAll('*').forEach((el) => {
        // Decorative subtrees may overflow by design.
        if (el.closest('[aria-hidden="true"]')) return;

        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;

        if (r.right > vw + TOLERANCE || r.left < -TOLERANCE) {
          bad.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').slice(0, 80),
            left: Math.round(r.left),
            right: Math.round(r.right),
            text: (el.textContent || '').trim().slice(0, 50),
          });
        }
      });
      return { vw, bad };
    });

    expect(
      offenders.bad,
      `${offenders.bad.length} element(s) extend outside the ${offenders.vw}px viewport on ` +
        `${testInfo.project.name} (${route.url}). Content is clipped and unreachable:\n` +
        offenders.bad
          .map((o) => `  <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} "${o.text}"`)
          .join('\n')
    ).toEqual([]);
  });
}
