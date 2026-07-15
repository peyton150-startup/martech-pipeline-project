import { test, expect } from "@playwright/test";
import { validators } from "./helpers/schemaValidator";

test("event fires with valid payload", async ({ page }) => {
  // Navigate to a destination page
  await page.goto("/destinations/maui-shores");

  // Wait for the destination_viewed event in the dataLayer — the tracker
  // fires in a post-hydration effect, so it can land after the load event.
  await page.waitForFunction(() =>
    (window.dataLayer || []).some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.event === "destination_viewed"
    )
  );
  const dataLayer = await page.evaluate(() => window.dataLayer);
  expect(dataLayer).toBeDefined();

  // Find the destination_viewed event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = dataLayer.find((e: any) => e.event === "destination_viewed");
  expect(event).toBeDefined();

  // Validate against schema
  const validate = validators.destination_viewed;
  const isValid = validate(event);

  if (!isValid) {
    console.error(validate.errors);
  }

  expect(isValid).toBe(true);
});
