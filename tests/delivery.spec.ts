import { test, expect, type Page } from "@playwright/test";

/**
 * The delivery layer's contract: an event fired immediately before the page
 * unloads still reaches the collect endpoint (via sendBeacon on pagehide),
 * and events that could not be flushed replay on the next page load.
 */

async function collectedEventIds(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/collect");
  return (await res.json()).event_ids as string[];
}

test("delivery: event fired right before navigation still arrives", async ({
  page,
}) => {
  await page.goto("/destinations/maui-shores");
  await page.getByTestId("consent-grant").click();

  // Fire the CTA event and navigate away immediately — no waiting for any
  // network call. The in-flight window is where naive tracking loses data.
  await page.getByTestId("cta-book_now_detail").click();
  const eventId = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = (window.dataLayer || []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.event === "cta_clicked"
    ) as { event_id?: string } | undefined;
    return evt?.event_id;
  });
  expect(eventId).toBeTruthy();

  await page.goto("/"); // hard navigation — unloads the page

  // The pagehide flush (sendBeacon) must have carried the event across.
  await expect.poll(() => collectedEventIds(page)).toContain(eventId!);
});

test("delivery: undelivered queue replays on the next page load", async ({
  page,
}) => {
  const seededId = "11111111-2222-4333-8444-555555555555";

  // Simulate a previous page that died before its flush completed: the
  // event is persisted in the localStorage queue but never sent.
  await page.addInitScript(
    ([id]) => {
      window.localStorage.setItem("mtp_consent", "granted");
      window.localStorage.setItem(
        "mtp_delivery_queue",
        JSON.stringify([
          {
            event: "cta_clicked",
            event_id: id,
            timestamp: new Date().toISOString(),
            consent_state: "granted",
            cta: {
              cta_id: "book_now_detail",
              cta_text: "Check availability",
              location: "detail_page",
            },
          },
        ])
      );
    },
    [seededId]
  );

  await page.goto("/");

  // First tracked event initializes the delivery layer, which replays the
  // leftover queue.
  await expect.poll(() => collectedEventIds(page)).toContain(seededId);
});

test("delivery: nothing is sent while consent is denied", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mtp_consent", "denied");
  });

  let collectCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/collect") && req.method() === "POST") {
      collectCalls++;
    }
  });

  await page.goto("/destinations/aspen-highlands");
  await page.goto("/"); // pagehide flush would fire here if not gated
  await page.waitForTimeout(2000); // outlive the foreground debounce

  expect(collectCalls).toBe(0);

  // The denied flush drops the held queue instead of persisting it.
  const queueRaw = await page.evaluate(() =>
    window.localStorage.getItem("mtp_delivery_queue")
  );
  expect(JSON.parse(queueRaw ?? "[]")).toEqual([]);
});
