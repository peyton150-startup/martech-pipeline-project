import { NextRequest, NextResponse } from "next/server";
import { getValidator } from "@/lib/tracking/validators";

/**
 * First-party collect endpoint for the delivery layer (lib/tracking/deliver.ts).
 *
 * Accepts a JSON array of tracked events and, for each one:
 *   1. re-validates it against the same JSON Schemas the browser used, so a
 *      forged or malformed payload never enters the store (defense in depth —
 *      the schema is the contract at the client edge *and* the server edge);
 *   2. dedupes by `event_id`, making the client's at-least-once delivery
 *      idempotent (replays and double-flushes overwrite themselves).
 *
 * The store is a bounded in-memory LRU — plenty for the demo and the
 * Playwright harness (GET is how tests assert an event survived navigation).
 * A real deployment would forward valid events to a queue or warehouse here.
 */

// Bounded so a long-running server can't leak memory; oldest evicted first.
const MAX_EVENTS = 1000;
const received = new Map<string, Record<string, unknown>>();

function store(event: Record<string, unknown>) {
  const id = event.event_id as string;
  // Re-insert moves the key to the most-recent position (LRU touch).
  if (received.has(id)) received.delete(id);
  received.set(id, event);
  while (received.size > MAX_EVENTS) {
    const oldest = received.keys().next().value;
    if (oldest === undefined) break;
    received.delete(oldest);
  }
}

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
  let accepted = 0;
  let rejected = 0;

  for (const evt of events) {
    if (evt === null || typeof evt !== "object") {
      rejected++;
      continue;
    }
    const record = evt as Record<string, unknown>;
    const validate = getValidator(String(record.event));
    // Unknown event name or schema-invalid payload is dropped, not stored.
    if (!validate || !validate(record)) {
      rejected++;
      continue;
    }
    store(record);
    accepted++;
  }

  // 400 only when nothing was usable; a partial batch still succeeds so a
  // single bad row can't sink a beacon carrying good events.
  if (accepted === 0 && rejected > 0) {
    return NextResponse.json({ accepted, rejected }, { status: 400 });
  }
  return NextResponse.json({ accepted, rejected }, { status: 202 });
}

export function GET() {
  return NextResponse.json({
    count: received.size,
    event_ids: [...received.keys()],
    events: [...received.values()],
  });
}
