import { test, expect } from "@playwright/test";
import { validators } from "./helpers/schemaValidator";

test("saved: the save button emits a valid destination_saved event", async ({
  page,
}) => {
  await page.goto("/destinations/maui-shores");
  await page.getByTestId("consent-grant").click();

  await page.getByTestId("save-maui-shores").click();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataLayer = await page.evaluate(() => window.dataLayer as any[]);
  const evt = dataLayer.find(
    (e) => (e as { event?: string }).event === "destination_saved"
  );
  expect(evt).toBeDefined();

  const validate = validators.destination_saved;
  const ok = validate(evt);
  if (!ok) console.error(validate.errors);
  expect(ok).toBe(true);
  expect(evt.destination.slug).toBe("maui-shores");
  expect(evt.destination.location).toBe("detail_page");
});

test("saved: a save outranks a view for the top-left slot", async ({ page }) => {
  // View one destination (interaction weight 1)...
  await page.goto("/destinations/maui-shores");
  // ...then save a different one (weight 2 — a stronger signal).
  await page.goto("/destinations/kyoto-quarter");
  await page.getByTestId("save-kyoto-quarter").click();

  await page.goto("/");
  const firstCard = page.getByTestId("destination-grid").locator("a").first();
  await expect(firstCard).toHaveAttribute(
    "href",
    "/destinations/kyoto-quarter"
  );
});

test("saved: heart reflects prior saves across navigation", async ({ page }) => {
  await page.goto("/destinations/maui-shores");
  const save = page.getByTestId("save-maui-shores");
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");

  // Return to the page — the saved state persists (localStorage).
  await page.goto("/");
  await page.goto("/destinations/maui-shores");
  await expect(page.getByTestId("save-maui-shores")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
