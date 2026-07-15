# Event & Property Naming Conventions

These rules apply to every event pushed to the dataLayer and every schema in
`lib/tracking/schemas/`. New events must pass schema validation and follow
this document before merging.

## Event names

- `snake_case`, past tense, `object_verb` order: `destination_viewed`,
  `cta_clicked`, `page_viewed`.
- One event per user action. No overloaded "interaction" events with a `type`
  discriminator.
- The event name in the payload (`event` property) must exactly match the
  schema `$id` and filename.

## Property names

- `snake_case` throughout. No camelCase, no abbreviations (`destination`, not
  `dest`).
- Group related properties into a namespace object named after the entity:
  `page.*`, `destination.*`, `cta.*`.
- IDs end in `_id`; slugs end in `_slug`; monetary values are numbers named
  `price_*` (no currency symbols in values).

## Required on every event (stamped by `trackEvent`, never by callers)

| Property        | Type              | Purpose                              |
| --------------- | ----------------- | ------------------------------------ |
| `event_id`      | UUID v4           | Exact-once assertions, dedupe        |
| `timestamp`     | ISO 8601 string   | Ordering, race-condition analysis    |
| `consent_state` | granted/denied/pending | Consent audit on every payload  |

## Schema rules

- Draft-07 JSON Schema, one file per event, `$id` = event name.
- `additionalProperties: false` at every object level. Loose schemas make QA
  meaningless.
- Enums over free strings wherever the value set is known
  (`category`, `location`, `consent_state`).

## Adding a new event

1. Write the schema in `lib/tracking/schemas/<event_name>.json`.
2. Add the TypeScript type in `lib/tracking/types.ts` and register the
   compiled validator in `trackEvent.ts`.
3. Add a Playwright assertion covering fire timing and payload shape.
4. Document the trigger condition below.

## Event registry

| Event                | Fires when                                   | Segmentation impact          |
| -------------------- | -------------------------------------------- | ---------------------------- |
| `page_viewed`        | Once per page render, on mount               | none                         |
| `destination_viewed` | Destination detail page renders              | sets `<category>_intent`     |
| `cta_clicked`        | Any booking/conversion CTA is clicked        | none (conversion signal)     |
