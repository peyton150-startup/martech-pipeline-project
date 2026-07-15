import { test, expect, type Page } from "@playwright/test";

/**
 * Visit a destination page and wait until its interaction count reaches the
 * expected value — the trackers fire in a post-hydration effect, so a bare
 * goto could navigate away before the count is written.
 */
async function visit(page: Page, slug: string, expectedCount: number) {
  await page.goto(`/destinations/${slug}`);
  await expect
    .poll(() =>
      page.evaluate((s) => {
        const raw = window.localStorage.getItem("mtp_interactions");
        return raw ? ((JSON.parse(raw) as Record<string, number>)[s] ?? 0) : 0;
      }, slug)
    )
    .toBe(expectedCount);
}

function gridHrefs(page: Page) {
  return page
    .getByTestId("destination-grid")
    .locator("a")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
}

test("engagement: most-viewed destination renders top-left", async ({
  page,
}) => {
  await visit(page, "maui-shores", 1);
  await visit(page, "amalfi-terraces", 1);
  await visit(page, "amalfi-terraces", 2);

  await page.goto("/");
  const firstCard = page.getByTestId("destination-grid").locator("a").first();
  await expect(firstCard).toHaveAttribute(
    "href",
    "/destinations/amalfi-terraces"
  );
});

test("engagement: CTA clicks count as interactions", async ({ page }) => {
  // maui: 1 view + 1 CTA click = 2 interactions.
  await visit(page, "maui-shores", 1);
  await page.getByTestId("cta-book_now_detail").click();
  // amalfi: 1 view — most recent, but fewer interactions.
  await visit(page, "amalfi-terraces", 1);

  await page.goto("/");
  const firstCard = page.getByTestId("destination-grid").locator("a").first();
  await expect(firstCard).toHaveAttribute("href", "/destinations/maui-shores");
});

test("engagement: segment ordering fills the rest of the grid", async ({
  page,
}) => {
  await visit(page, "maui-shores", 1);

  await page.goto("/");
  await expect
    .poll(() => gridHrefs(page))
    .toEqual([
      "/destinations/maui-shores", // top-left: most interacted
      "/destinations/amalfi-terraces", // next: matches beach_intent segment
      "/destinations/aspen-highlands", // rest keep original order
      "/destinations/kyoto-quarter",
    ]);
});

test("engagement: default order with no interaction history", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => gridHrefs(page))
    .toEqual([
      "/destinations/maui-shores",
      "/destinations/aspen-highlands",
      "/destinations/kyoto-quarter",
      "/destinations/amalfi-terraces",
    ]);
});
