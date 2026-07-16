import { test, expect } from "@playwright/test";

/**
 * The collect endpoint re-validates every event against the same JSON Schemas
 * the browser used, so a malformed or forged payload never enters the store —
 * defense in depth, and the same contract at the client edge and server edge.
 */

const validCta = (eventId: string) => ({
  event: "cta_clicked",
  event_id: eventId,
  timestamp: new Date().toISOString(),
  consent_state: "granted",
  cta: { cta_id: "book_now_detail", cta_text: "Check availability", location: "detail_page" },
});

test("collect: a schema-invalid payload is rejected (400) and not stored", async ({
  request,
}) => {
  // Missing the required `cta` object.
  const res = await request.post("/api/collect", {
    data: [{ event: "cta_clicked", event_id: "not-a-uuid" }],
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).accepted).toBe(0);
});

test("collect: an unknown event name is rejected", async ({ request }) => {
  const res = await request.post("/api/collect", {
    data: [
      {
        event: "totally_made_up",
        event_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        timestamp: new Date().toISOString(),
        consent_state: "granted",
      },
    ],
  });
  expect(res.status()).toBe(400);
});

test("collect: a valid payload is accepted (202) and retrievable", async ({
  request,
}) => {
  const id = "abcdef01-2345-4678-8abc-def012345678";
  const res = await request.post("/api/collect", { data: [validCta(id)] });
  expect(res.status()).toBe(202);
  expect((await res.json()).accepted).toBe(1);

  const listed = await (await request.get("/api/collect")).json();
  expect(listed.event_ids).toContain(id);
});

test("collect: a mixed batch keeps the good and drops the bad", async ({
  request,
}) => {
  const goodId = "11112222-3333-4444-8555-666677778888";
  const res = await request.post("/api/collect", {
    data: [validCta(goodId), { event: "cta_clicked", event_id: "bad" }],
  });
  // Partial success — one good row still lands, so the batch isn't a 400.
  expect(res.status()).toBe(202);
  const body = await res.json();
  expect(body.accepted).toBe(1);
  expect(body.rejected).toBe(1);

  const listed = await (await request.get("/api/collect")).json();
  expect(listed.event_ids).toContain(goodId);
});
