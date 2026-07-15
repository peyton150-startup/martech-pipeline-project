import { test, expect } from "@playwright/test";

test("payload structure regression", async ({ page }) => {
  await page.goto("/destinations/maui-shores");

  const dataLayer = await page.evaluate(() => window.dataLayer);
  // Filter out any initial GTM pushes, keep only our structured events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = dataLayer.filter((e: any) => e.event_id);

  // We map the actual events to just their shape (keys)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getShape = (obj: any): any => {
    if (typeof obj !== "object" || obj === null) return typeof obj;
    if (Array.isArray(obj)) return obj.map(getShape);
    const shape: Record<string, string> = {};
    for (const key in obj) {
      shape[key] = typeof obj[key];
      if (typeof obj[key] === "object" && obj[key] !== null) {
        shape[key] = getShape(obj[key]);
      }
    }
    return shape;
  };

  const shapes = events.map(getShape);

  // Take a snapshot of the shapes. 
  // Playwright will create the snapshot file on the first run.
  expect(JSON.stringify(shapes, null, 2)).toMatchSnapshot("event-shapes.json");
});
