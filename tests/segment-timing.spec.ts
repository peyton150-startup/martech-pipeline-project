import { test, expect } from "@playwright/test";

test("ordering/timing: segment written before navigation completes", async ({
  page,
}) => {
  await page.goto("/destinations/maui-shores");

  // Read the localStorage for mtp_segment
  const segmentRaw = await page.evaluate(() =>
    window.localStorage.getItem("mtp_segment")
  );
  expect(segmentRaw).not.toBeNull();

  const segment = JSON.parse(segmentRaw!);
  expect(segment.segment).toBe("beach_intent");

  // Verify the cookie is also set
  const cookies = await page.context().cookies();
  const segmentCookie = cookies.find((c) => c.name === "mtp_segment");
  expect(segmentCookie).toBeDefined();

  const decodedCookie = decodeURIComponent(segmentCookie!.value);
  const parsedCookie = JSON.parse(decodedCookie);
  expect(parsedCookie.segment).toBe("beach_intent");
});
