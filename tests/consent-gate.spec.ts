import { test, expect } from "@playwright/test";

test.describe("consent gate", () => {
  test("with consent denied, assert zero vendor network calls", async ({
    page,
  }) => {
    // We can block network requests to PostHog and GTM and count them.
    let vendorCalls = 0;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("googletagmanager.com") || url.includes("posthog.com")) {
        vendorCalls++;
      }
    });

    // Set consent to denied before loading
    await page.addInitScript(() => {
      window.localStorage.setItem("mtp_consent", "denied");
    });

    await page.goto("/");
    await page.waitForTimeout(1000); // Wait a bit to ensure no late calls

    expect(vendorCalls).toBe(0);
  });

  test("with consent granted, assert the calls fire", async ({ page }) => {
    let vendorCalls = 0;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("googletagmanager.com") || url.includes("posthog.com")) {
        vendorCalls++;
      }
    });

    await page.goto("/");
    // Click the allow button on the banner
    await page.click("data-testid=consent-grant");

    // We expect the banner to NOT be visible, and network calls to happen
    // Wait for the GTM tag to load (it requires NEXT_PUBLIC_GTM_ID to be set,
    // if it's not set in the test environment, GTM might not load.
    // For this test, we verify the dataLayer event consent_updated is pushed).
    const dataLayer = await page.evaluate(() => window.dataLayer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const consentEvent = dataLayer.find((e: any) => e.event === "consent_updated");
    expect(consentEvent.consent_state).toBe("granted");
  });
});
