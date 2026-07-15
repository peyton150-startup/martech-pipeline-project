import { NextRequest, NextResponse } from "next/server";

/**
 * First-party collect endpoint for the delivery layer (lib/tracking/deliver.ts).
 *
 * Accepts a JSON array of tracked events and dedupes them by `event_id`,
 * which makes the client's at-least-once delivery idempotent: replays and
 * double-flushes are safe because a redelivered event overwrites itself.
 *
 * The store is per-instance memory — plenty for the demo and the Playwright
 * harness (GET is how tests assert an event survived navigation). A real
 * deployment would forward to a queue or warehouse here.
 */
const received = new Map<string, Record<string, unknown>>();

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    // sendBeacon posts a Blob; NextRequest.json() parses it regardless of
    // the content-type the browser attached.
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const events = Array.isArray(body) ? body : [body];
  for (const evt of events) {
    if (
      evt !== null &&
      typeof evt === "object" &&
      typeof (evt as { event_id?: unknown }).event_id === "string"
    ) {
      const record = evt as Record<string, unknown>;
      received.set(record.event_id as string, record);
    }
  }
  return new NextResponse(null, { status: 204 });
}

export function GET() {
  return NextResponse.json({
    count: received.size,
    event_ids: [...received.keys()],
    events: [...received.values()],
  });
}
