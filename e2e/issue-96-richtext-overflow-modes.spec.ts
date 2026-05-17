/**
 * End-to-end coverage for issue #96 — per-column rich-text overflow modes.
 *
 * Story: `examples-richtext--overflow-modes` (see
 * `stories/RichText.stories.tsx#OverflowModes`).
 *
 * Three rich-text cells are rendered side-by-side in a 180px-wide Notes
 * column, one per overflow mode (`truncate`, `wrap`, `fit`). The story
 * seeds each cell with a long markdown string whose laid-out width
 * exceeds the column width so each mode's behaviour is observable:
 *
 *   - `truncate` (default): the wrapper applies `text-overflow: ellipsis`
 *     to clip the rendered markdown at a single line and trail with a
 *     U+2026 character. The DOM exposes `data-richtext-overflow="truncate"`
 *     on the wrapper so this spec can target the right element without
 *     relying on grid-internal layout details.
 *
 *   - `wrap`: the wrapper switches to `white-space: normal` so the
 *     rendered markdown wraps to multiple lines. The cell's natural
 *     content height (as observed via `scrollHeight` on the
 *     `[data-testid="richtext-rendered"]` content node) exceeds a
 *     single-line height, proving the wrap actually engaged. (The
 *     row-height growth itself is a body-layout concern tracked
 *     separately; this assertion stays scoped to the rich-text cell's
 *     own measurable surface.)
 *
 *   - `fit`: the `RichTextDisplay` shrink-to-fit hook scales the
 *     wrapper's `font-size` down via `ResizeObserver` so the entire
 *     single-line content stays visible. We assert that the computed
 *     `font-size` on the wrapper falls below the base 13px, which is
 *     only reachable when the shrink path engaged.
 *
 * The story renders three SEPARATE single-row grids so a per-row mode
 * override is observable without leaking grid-internal per-row column
 * machinery into the test.
 */
import { test, expect, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-richtext--overflow-modes';

async function waitForStory(page: Page): Promise<void> {
  await page
    .locator('[data-testid="richtext-overflow-modes"]')
    .waitFor({ state: 'visible' });
  // The grids inside each section have to render at least one row each
  // before assertions can read the cells — wait for every overflow-mode
  // wrapper to appear so race-condition retries don't fire on the
  // wrong-cell selector.
  await page
    .locator('[data-richtext-overflow="truncate"]')
    .first()
    .waitFor({ state: 'visible' });
  await page
    .locator('[data-richtext-overflow="wrap"]')
    .first()
    .waitFor({ state: 'visible' });
  await page
    .locator('[data-richtext-overflow="fit"]')
    .first()
    .waitFor({ state: 'visible' });
}

test.describe('Rich-text overflow modes — per-column richTextOverflow (#96)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForStory(page);
  });

  test('truncate mode clips at the cell width with an ellipsis', async ({ page }) => {
    const wrapper = page
      .locator('[data-testid="grid-truncate"] [data-richtext-overflow="truncate"]')
      .first();
    await expect(wrapper).toBeVisible();

    // Computed style proves the truncation contract: `text-overflow:
    // ellipsis` + `white-space: nowrap` is what produces the trailing
    // U+2026 on overflow.
    const computed = await wrapper.evaluate((el) => {
      const cs = window.getComputedStyle(el as HTMLElement);
      return {
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace,
        overflow: cs.overflow,
      };
    });
    expect(computed.textOverflow).toBe('ellipsis');
    expect(computed.whiteSpace).toBe('nowrap');

    // The content is wider than the wrapper — assert the content's
    // intrinsic width (`scrollWidth`) exceeds the wrapper's box width.
    const overflowed = await wrapper.evaluate((el) => {
      const node = el as HTMLElement;
      return node.scrollWidth > node.clientWidth;
    });
    expect(overflowed).toBe(true);
  });

  test('wrap mode lets the content reflow onto multiple lines', async ({ page }) => {
    const wrapper = page
      .locator('[data-testid="grid-wrap"] [data-richtext-overflow="wrap"]')
      .first();
    await expect(wrapper).toBeVisible();

    const computed = await wrapper.evaluate((el) => {
      const cs = window.getComputedStyle(el as HTMLElement);
      return {
        whiteSpace: cs.whiteSpace,
        wordWrap: cs.wordWrap,
      };
    });
    expect(computed.whiteSpace).toBe('normal');

    // Multi-line proof: the content's natural height exceeds a single
    // line. We compute against the wrapper's own line-height to keep the
    // assertion robust against font-size tweaks.
    const heights = await wrapper.evaluate((el) => {
      const node = el as HTMLElement;
      const cs = window.getComputedStyle(node);
      const lineHeight =
        parseFloat(cs.lineHeight) ||
        parseFloat(cs.fontSize) * 1.2;
      return {
        scrollHeight: node.scrollHeight,
        offsetHeight: node.offsetHeight,
        lineHeight,
      };
    });
    // At least two lines: `scrollHeight >= 1.5 * lineHeight` guards
    // against sub-pixel rounding while still requiring real wrapping.
    expect(heights.scrollHeight).toBeGreaterThan(heights.lineHeight * 1.5);
  });

  test('fit mode scales the rendered font-size down so content fits without truncation', async ({
    page,
  }) => {
    const wrapper = page
      .locator('[data-testid="grid-fit"] [data-richtext-overflow="fit"]')
      .first();
    await expect(wrapper).toBeVisible();

    // The ResizeObserver-driven shrink-to-fit pass runs in a microtask
    // after layout; wait one rAF tick so the computed style reflects the
    // shrunk value before reading it. `expect.poll` keeps the assertion
    // resilient on slow CI runners.
    await expect
      .poll(
        async () =>
          await wrapper.evaluate((el) =>
            parseFloat(window.getComputedStyle(el as HTMLElement).fontSize),
          ),
        {
          message: 'fit-mode wrapper should shrink font-size below 13px base',
          timeout: 5000,
        },
      )
      .toBeLessThan(13);

    // And the shrink must respect the documented 9px floor — assertion
    // is purely a sanity guard so an over-aggressive shrink regression
    // surfaces in CI rather than at a customer site.
    const fontPx = await wrapper.evaluate((el) =>
      parseFloat(window.getComputedStyle(el as HTMLElement).fontSize),
    );
    expect(fontPx).toBeGreaterThanOrEqual(9);
  });

  test('every rendered wrapper exposes its mode via data-richtext-overflow', async ({
    page,
  }) => {
    // Smoke check: the attribute is what the other three tests pivot on,
    // so assert all three values are present somewhere in the document.
    const modes = await page
      .locator('[data-richtext-overflow]')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.richtextOverflow),
      );
    expect(modes).toContain('truncate');
    expect(modes).toContain('wrap');
    expect(modes).toContain('fit');
  });
});
