# SQL Analysis — Querying the Pipeline's Own Event Data

All queries below are **HogQL** (PostHog's SQL dialect, ClickHouse-flavored) and
were **actually executed on 2026-07-15** against this project's live event data
(PostHog project `512758`, US cloud) via the PostHog Query API. The result
tables are pasted verbatim. Re-run any of them in the
[PostHog SQL editor](https://us.posthog.com/project/512758/sql) or via
`POST /api/projects/512758/query` (see [`scripts/etl.mjs`](../scripts/etl.mjs)
for the API call shape).

Data volume is small — one tester's browsing session — but every query is the
same one you'd run at production scale; only the numbers grow.

---

## 1. Event volume overview

What's flowing, from how many people, and when.

```sql
SELECT event, count() AS total_events, uniq(person_id) AS unique_persons,
       min(timestamp) AS first_seen, max(timestamp) AS last_seen
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('page_viewed', 'destination_viewed', 'cta_clicked',
                'personalization_decided', 'consent_granted', 'destination_card_clicked')
GROUP BY event
ORDER BY total_events DESC
```

| event | total_events | unique_persons | first_seen | last_seen |
|---|---|---|---|---|
| personalization_decided | 16 | 1 | 2026-07-15 19:18:03 | 2026-07-15 19:59:32 |
| page_viewed | 14 | 1 | 2026-07-15 19:18:01 | 2026-07-15 19:20:32 |
| destination_viewed | 9 | 1 | 2026-07-15 19:18:01 | 2026-07-15 19:59:31 |
| destination_card_clicked | 7 | 1 | 2026-07-15 19:18:01 | 2026-07-15 19:20:31 |
| cta_clicked | 4 | 1 | 2026-07-15 19:18:02 | 2026-07-15 19:59:32 |
| consent_granted | 1 | 1 | 2026-07-15 19:59:23 | 2026-07-15 19:59:23 |

`uniq(person_id)` — not `distinct_id` — because one person can carry many
distinct_ids across devices/sessions; person_id is the resolved identity.

## 2. Events per segment

The segment is synced to PostHog as a **person property** by PostHogProvider,
so any event can be sliced by it.

```sql
SELECT coalesce(person.properties.segment, 'no segment yet') AS segment,
       count() AS events, uniq(person_id) AS persons
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('page_viewed', 'destination_viewed', 'cta_clicked', 'personalization_decided')
GROUP BY segment
ORDER BY events DESC
```

| segment | events | persons |
|---|---|---|
| ski_intent | 38 | 1 |
| city_intent | 3 | 1 |
| no segment yet | 2 | 1 |

Person-on-events mode is enabled on this project, so `person.properties.segment`
reflects the segment **at ingestion time** — the same person legitimately
appears under multiple segments as their intent evolved. That's a feature for
this analysis (it preserves history), and the caveat you must know before
treating the column as "current segment."

## 3. Conversion: destination view → CTA click, by segment

The justification query for personalization: do segmented visitors convert?

```sql
SELECT segment,
       count() AS destination_viewers,
       countIf(clicked_cta) AS converted_to_cta,
       round(100 * countIf(clicked_cta) / count(), 1) AS conversion_pct
FROM (
    SELECT person_id,
           coalesce(any(person.properties.segment), 'no segment') AS segment,
           countIf(event = 'destination_viewed') > 0 AS viewed_destination,
           countIf(event = 'cta_clicked') > 0 AS clicked_cta
    FROM events
    WHERE timestamp >= now() - INTERVAL 30 DAY
      AND event IN ('destination_viewed', 'cta_clicked')
    GROUP BY person_id
)
WHERE viewed_destination
GROUP BY segment
ORDER BY destination_viewers DESC
```

| segment | destination_viewers | converted_to_cta | conversion_pct |
|---|---|---|---|
| city_intent | 1 | 1 | 100.0 |

One scan of `events` with conditional aggregates (`countIf`) instead of a
self-join — the ClickHouse-friendly shape. With an A/B holdout flag, adding
`person.properties.$feature/personalization-holdout` to the GROUP BY turns
this directly into the personalized-vs-control readout.

## 4. Time from destination view to CTA click

Intent-to-action latency per person.

```sql
SELECT count() AS persons_with_both,
       round(avg(seconds_to_cta), 1) AS avg_seconds,
       round(median(seconds_to_cta), 1) AS median_seconds,
       min(seconds_to_cta) AS min_seconds,
       max(seconds_to_cta) AS max_seconds
FROM (
    SELECT person_id,
           dateDiff('second',
                    minIf(timestamp, event = 'destination_viewed'),
                    minIf(timestamp, event = 'cta_clicked')) AS seconds_to_cta,
           countIf(event = 'destination_viewed') AS views,
           countIf(event = 'cta_clicked') AS ctas
    FROM events
    WHERE timestamp >= now() - INTERVAL 30 DAY
      AND event IN ('destination_viewed', 'cta_clicked')
    GROUP BY person_id
    HAVING views > 0 AND ctas > 0 AND seconds_to_cta >= 0
)
```

| persons_with_both | avg_seconds | median_seconds | min_seconds | max_seconds |
|---|---|---|---|---|
| 1 | 1.0 | 1.0 | 1 | 1 |

`minIf` guarded by `HAVING views > 0 AND ctas > 0` — an unguarded `minIf`
returns epoch zero for persons missing one side, which silently poisons the
average.

## 5. Duplicate event_id check (exact-once, end to end)

The Playwright harness asserts exact-once in the browser; this asserts it
survived the full pipeline into the warehouse.

```sql
SELECT count() AS total_tracked_events,
       uniq(properties.event_id) AS unique_event_ids,
       count() - uniq(properties.event_id) AS duplicates
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND properties.event_id IS NOT NULL
```

| total_tracked_events | unique_event_ids | duplicates |
|---|---|---|
| 44 | 44 | 0 |

Zero duplicates. Scope caveat: this covers rows that carry the client
`event_id` — see the drift note below.

## 6. The race-condition metric: decided_before_paint by strategy

The core engineering claim, measured from field data.

```sql
SELECT properties.strategy AS strategy,
       count() AS decisions,
       round(100 * countIf(properties.decided_before_paint = true) / count(), 1) AS before_paint_pct,
       round(avg(toFloat(properties.latency_ms)), 3) AS avg_latency_ms,
       round(max(toFloat(properties.latency_ms)), 3) AS max_latency_ms
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = 'personalization_decided'
GROUP BY strategy
ORDER BY decisions DESC
```

| strategy | decisions | before_paint_pct | avg_latency_ms | max_latency_ms |
|---|---|---|---|---|
| *(null)* | 14 | 0.0 | — | — |
| local-first | 2 | 100.0 | 0.0 | 0.0 |

Every decision made by the current pipeline resolved **before paint with
0.0ms decision latency** — the local-first strategy doing exactly what it
was engineered to do.

### A real instrumentation-drift finding

The 14 null-strategy rows are not noise — they're an honest finding this
analysis surfaced: events captured by the **earlier** PostHog wiring carried
`event_id`/`consent_state` but not the flattened decision payload; events
after the pipeline was upgraded carry the full payload (`segment`, `strategy`,
`decided_before_paint`, `latency_ms`) but dropped the top-level `event_id`.
This is precisely the tracking-spec drift the schema-codegen gate now prevents
going forward, and the ETL ([`scripts/etl.mjs`](../scripts/etl.mjs)) absorbs
it by falling back to PostHog's ingestion `uuid` as the dedupe key when
`event_id` is absent.
