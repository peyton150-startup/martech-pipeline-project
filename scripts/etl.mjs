/**
 * ETL: PostHog → SQLite warehouse.
 *
 *   Extract    events from the PostHog Query API (REST + JSON, HogQL over HTTPS)
 *   Transform  flatten rows, dedupe on event_id, type-cast booleans/numbers
 *   Load       into a normalized SQLite schema (data/warehouse.db)
 *
 * Usage:
 *   POSTHOG_PERSONAL_API_KEY=phx_... npm run etl          # live extract
 *   npm run etl -- --fixture                              # offline: uses fixtures/posthog-events.sample.json
 *
 * Env (live mode):
 *   POSTHOG_PERSONAL_API_KEY  personal API key (Settings → Personal API keys; scope: query:read)
 *   POSTHOG_PROJECT_ID        defaults to 512758 (the Wayfarer demo project)
 *   POSTHOG_API_HOST          defaults to https://us.posthog.com
 *
 * The loader is idempotent (INSERT OR REPLACE keyed on event_id), mirroring the
 * client's at-least-once delivery: replaying an extract is always safe.
 *
 * Known instrumentation drift this pipeline absorbs: early events carried the
 * client `event_id` but no flattened payload; later events carry the payload
 * but no `event_id`. Rows without an event_id fall back to PostHog's ingestion
 * `uuid` as the dedupe key, so both eras load cleanly.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const dbFlagIndex = args.indexOf("--db");
const dbPath =
  dbFlagIndex !== -1 && args[dbFlagIndex + 1]
    ? path.resolve(args[dbFlagIndex + 1])
    : path.join(root, "data", "warehouse.db");

const EXTRACT_SQL = `
  SELECT
    uuid, event, timestamp, distinct_id,
    properties.event_id AS event_id,
    properties.consent_state AS consent_state,
    properties.slug AS slug,
    properties.category AS category,
    properties.price_from AS price_from,
    properties.segment AS segment,
    properties.variant AS variant,
    properties.strategy AS strategy,
    properties.decided_before_paint AS decided_before_paint,
    properties.latency_ms AS latency_ms,
    properties.cta_id AS cta_id,
    properties.location AS location,
    properties.destination_slug AS destination_slug,
    properties.$pathname AS pathname
  FROM events
  WHERE timestamp >= now() - INTERVAL 30 DAY
    AND event IN ('page_viewed', 'destination_viewed', 'cta_clicked', 'personalization_decided')
  ORDER BY timestamp ASC
  LIMIT 500
`;

// ---- extract ----------------------------------------------------------------

async function extract() {
  if (useFixture) {
    const fixture = path.join(root, "fixtures", "posthog-events.sample.json");
    console.log(`extract: reading fixture ${path.relative(root, fixture)}`);
    return JSON.parse(readFileSync(fixture, "utf8"));
  }

  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) {
    console.error(
      "POSTHOG_PERSONAL_API_KEY is not set. Create one under PostHog → Settings → " +
        "Personal API keys (scope: query:read), or run with --fixture for the offline sample."
    );
    process.exit(1);
  }
  const host = process.env.POSTHOG_API_HOST ?? "https://us.posthog.com";
  const projectId = process.env.POSTHOG_PROJECT_ID ?? "512758";
  const url = `${host}/api/projects/${projectId}/query/`;

  console.log(`extract: POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: EXTRACT_SQL } }),
  });
  if (!res.ok) {
    throw new Error(`PostHog query API returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ---- transform ---------------------------------------------------------------

function toBoolInt(v) {
  if (v === null || v === undefined) return null;
  return v === true || v === "True" || v === "true" || v === 1 ? 1 : 0;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function transform(payload) {
  const { columns, results } = payload;
  if (!Array.isArray(columns) || !Array.isArray(results)) {
    throw new Error("unexpected query response shape: expected { columns, results }");
  }

  const records = new Map(); // event_id → record (dedupe)
  let duplicates = 0;

  for (const row of results) {
    const raw = Object.fromEntries(columns.map((c, i) => [c, row[i]]));
    // Dedupe key: client event_id when present; ingestion uuid otherwise
    // (later-era events dropped event_id — see header comment).
    const eventId = raw.event_id ?? raw.uuid;
    if (records.has(eventId)) {
      duplicates++;
      continue;
    }
    records.set(eventId, {
      event_id: eventId,
      uuid: raw.uuid,
      event_name: raw.event,
      occurred_at: new Date(raw.timestamp).toISOString(),
      distinct_id: raw.distinct_id,
      pathname: raw.pathname ?? null,
      consent_state: raw.consent_state ?? null,
      destination:
        raw.slug != null
          ? { slug: raw.slug, category: raw.category ?? null, price_from: toNum(raw.price_from) }
          : null,
      personalization:
        raw.strategy != null || raw.segment != null
          ? {
              segment: raw.segment ?? null,
              variant: raw.variant ?? null,
              strategy: raw.strategy ?? null,
              decided_before_paint: toBoolInt(raw.decided_before_paint),
              latency_ms: toNum(raw.latency_ms),
            }
          : null,
      cta:
        raw.cta_id != null
          ? {
              cta_id: raw.cta_id,
              location: raw.location ?? null,
              destination_slug: raw.destination_slug ?? null,
            }
          : null,
    });
  }

  console.log(`transform: ${results.length} rows → ${records.size} events (${duplicates} duplicates dropped)`);
  return [...records.values()];
}

// ---- load --------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    event_id      TEXT PRIMARY KEY,  -- client event_id; ingestion uuid when absent
    uuid          TEXT NOT NULL,     -- PostHog ingestion id
    event_name    TEXT NOT NULL,
    occurred_at   TEXT NOT NULL,     -- ISO 8601 UTC
    distinct_id   TEXT NOT NULL,
    pathname      TEXT,
    consent_state TEXT
  );
  CREATE TABLE IF NOT EXISTS event_destination (
    event_id   TEXT PRIMARY KEY REFERENCES events(event_id),
    slug       TEXT NOT NULL,
    category   TEXT,
    price_from REAL
  );
  CREATE TABLE IF NOT EXISTS event_personalization (
    event_id             TEXT PRIMARY KEY REFERENCES events(event_id),
    segment              TEXT,
    variant              TEXT,
    strategy             TEXT,
    decided_before_paint INTEGER,   -- 1/0/NULL
    latency_ms           REAL
  );
  CREATE TABLE IF NOT EXISTS event_cta (
    event_id         TEXT PRIMARY KEY REFERENCES events(event_id),
    cta_id           TEXT NOT NULL,
    location         TEXT,
    destination_slug TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_name_time ON events(event_name, occurred_at);
`;

function load(events) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  const insertEvent = db.prepare(
    `INSERT OR REPLACE INTO events (event_id, uuid, event_name, occurred_at, distinct_id, pathname, consent_state)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertDestination = db.prepare(
    `INSERT OR REPLACE INTO event_destination (event_id, slug, category, price_from) VALUES (?, ?, ?, ?)`
  );
  const insertPersonalization = db.prepare(
    `INSERT OR REPLACE INTO event_personalization (event_id, segment, variant, strategy, decided_before_paint, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertCta = db.prepare(
    `INSERT OR REPLACE INTO event_cta (event_id, cta_id, location, destination_slug) VALUES (?, ?, ?, ?)`
  );

  db.exec("BEGIN");
  for (const e of events) {
    insertEvent.run(e.event_id, e.uuid, e.event_name, e.occurred_at, e.distinct_id, e.pathname, e.consent_state);
    if (e.destination) {
      insertDestination.run(e.event_id, e.destination.slug, e.destination.category, e.destination.price_from);
    }
    if (e.personalization) {
      insertPersonalization.run(
        e.event_id,
        e.personalization.segment,
        e.personalization.variant,
        e.personalization.strategy,
        e.personalization.decided_before_paint,
        e.personalization.latency_ms
      );
    }
    if (e.cta) {
      insertCta.run(e.event_id, e.cta.cta_id, e.cta.location, e.cta.destination_slug);
    }
  }
  db.exec("COMMIT");

  // Post-load verification — the same checks the QA harness cares about.
  const tables = ["events", "event_destination", "event_personalization", "event_cta"];
  console.log(`load: ${path.relative(root, dbPath)}`);
  for (const t of tables) {
    const { n } = db.prepare(`SELECT count(*) AS n FROM ${t}`).get();
    console.log(`  ${t.padEnd(22)} ${n} rows`);
  }
  const dupes = db
    .prepare(`SELECT count(*) AS n FROM (SELECT uuid FROM events GROUP BY uuid HAVING count(*) > 1)`)
    .get();
  console.log(`  duplicate uuids        ${dupes.n} (expected 0)`);
  const byName = db
    .prepare(`SELECT event_name, count(*) AS n FROM events GROUP BY event_name ORDER BY n DESC`)
    .all();
  for (const r of byName) console.log(`  · ${r.event_name.padEnd(24)} ${r.n}`);
  db.close();
}

const payload = await extract();
load(transform(payload));
console.log("done.");
