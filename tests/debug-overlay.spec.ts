import { test, expect } from "@playwright/test";

test("debug overlay: hidden unless ?debug=1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("debug-overlay")).toHaveCount(0);
});

test("debug overlay: ?debug=1 enables it and it survives client navigation", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  await expect(page.getByTestId("debug-overlay")).toBeVisible();

  // Client-side nav drops the query param; sessionStorage keeps the flag.
  await page.locator('a[href="/destinations/maui-shores"]').click();
  await page.waitForURL("**/destinations/maui-shores");
  await expect(page.getByTestId("debug-overlay")).toBeVisible();

  // The destination view stamps a segment; the overlay shows it live.
  await expect(page.getByTestId("debug-segment")).toHaveText("beach_intent");
});

test("debug overlay: ?debug=0 turns it off", async ({ page }) => {
  await page.goto("/?debug=1");
  await expect(page.getByTestId("debug-overlay")).toBeVisible();
  await page.goto("/?debug=0");
  await expect(page.getByTestId("debug-overlay")).toHaveCount(0);
});

test("debug overlay: close button disables it", async ({ page }) => {
  await page.goto("/?debug=1");
  await page.getByTestId("debug-close").click();
  await expect(page.getByTestId("debug-overlay")).toHaveCount(0);
});

test("debug overlay: timeline tracks the race across navigation", async ({
  page,
}) => {
  // Step 1: destination view fires the seeding event + stamp.
  await page.goto("/destinations/maui-shores?debug=1");
  const timeline = page.getByTestId("debug-timeline");
  await expect(timeline).toContainText("destination_viewed (maui-shores) fired");
  await expect(timeline).toContainText("segment stamped → beach_intent");
  await expect(timeline).toContainText("waiting for next page");

  // Step 2: navigating home completes the race with a personalized render.
  await page.getByRole("link", { name: /all destinations/i }).click();
  await page.waitForURL("**/");
  await expect(timeline).toContainText("personalized render on /");
  await expect(timeline).toContainText("before paint: true");

  // The decision panel reflects the strategy that resolved it.
  await expect(page.getByTestId("debug-strategy")).toHaveText("local-first");
  await expect(page.getByTestId("debug-before-paint")).toHaveText("true");
});

test("debug overlay: event log records events with payloads", async ({
  page,
}) => {
  await page.goto("/?debug=1");
  const log = page.getByTestId("debug-events");
  await expect(log).toContainText("page_viewed");
  await expect(log).toContainText("personalization_decided");

  // Expanding an entry reveals the full payload.
  await log.getByText("page_viewed").first().click();
  await expect(log.locator("pre").first()).toContainText("event_id");
});

test("debug overlay: engagement section shows the top-left pick", async ({
  page,
}) => {
  await page.goto("/destinations/kyoto-quarter?debug=1");
  const engagement = page.getByTestId("debug-engagement");
  await expect(engagement).toContainText("kyoto-quarter");
  await expect(engagement).toContainText("top-left pick");
});
