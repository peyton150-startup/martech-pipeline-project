import { test, expect, type Page } from "@playwright/test";

/**
 * The second, behavioral segmentation dimension. A visitor who views 3+
 * destinations in a session without committing becomes `browsing_hesitant`
 * and the detail-page CTA adapts from "book" to "talk to a planner". A
 * commitment (CTA click or save) takes them out of that segment.
 */

function sessionViews(page: Page) {
  return page.evaluate(
    () => Number(window.sessionStorage.getItem("mtp_session_dest_views")) || 0
  );
}

test("behavior: 3 views without converting → assistance CTA", async ({
  page,
}) => {
  await page.goto("/destinations/maui-shores");
  await expect.poll(() => sessionViews(page)).toBe(1);
  await page.goto("/destinations/aspen-highlands");
  await expect.poll(() => sessionViews(page)).toBe(2);
  await page.goto("/destinations/kyoto-quarter");
  await expect.poll(() => sessionViews(page)).toBe(3);

  // 4th page: 3 prior views, no conversion → browsing_hesitant.
  await page.goto("/destinations/amalfi-terraces");
  await expect(page.getByTestId("cta-talk_to_planner")).toBeVisible();
  await expect(page.getByTestId("cta-book_now_detail")).toHaveCount(0);
});

test("behavior: converting keeps the standard book CTA", async ({ page }) => {
  await page.goto("/destinations/maui-shores");
  await expect.poll(() => sessionViews(page)).toBe(1);

  // Convert early — a CTA click flips the session to "engaged".
  await page.getByTestId("cta-book_now_detail").click();

  await page.goto("/destinations/aspen-highlands");
  await page.goto("/destinations/kyoto-quarter");
  await page.goto("/destinations/amalfi-terraces");

  // 3+ views but converted → not hesitant.
  await expect(page.getByTestId("cta-book_now_detail")).toBeVisible();
  await expect(page.getByTestId("cta-talk_to_planner")).toHaveCount(0);
});

test("behavior: the adaptive CTA decides before paint", async ({ page }) => {
  // Prime the hesitant state, gating each view so the count is committed
  // before the next navigation (the increment runs in a post-load effect).
  await page.goto("/destinations/maui-shores");
  await expect.poll(() => sessionViews(page)).toBe(1);
  await page.goto("/destinations/aspen-highlands");
  await expect.poll(() => sessionViews(page)).toBe(2);
  await page.goto("/destinations/kyoto-quarter");
  await expect.poll(() => sessionViews(page)).toBe(3);

  // Fresh detail page: the slot decides in useLayoutEffect after hydration,
  // so wait for the decision to reach the dataLayer before asserting.
  await page.goto("/destinations/santorini-blue");
  await page.waitForFunction(() =>
    (window.dataLayer || []).some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.event === "personalization_decided" && e.slot_id === "detail-cta"
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataLayer = await page.evaluate(() => window.dataLayer as any[]);
  const decision = dataLayer.find(
    (e) =>
      (e as { event?: string }).event === "personalization_decided" &&
      (e as { slot_id?: string }).slot_id === "detail-cta"
  );
  expect(decision).toBeDefined();
  expect(decision.personalization.decided_before_paint).toBe(true);
  expect(decision.personalization.segment).toBe("browsing_hesitant");
  expect(decision.personalization.variant).toBe("assist");
});
