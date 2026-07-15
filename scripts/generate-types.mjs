/**
 * Schema → TypeScript codegen.
 *
 * Regenerates lib/tracking/types.ts from the JSON Schemas in
 * lib/tracking/schemas/*.json, so the schema files are the single source of
 * truth: dev-time types, runtime ajv validation, and Playwright assertions
 * all derive from the same contract.
 *
 *   npm run codegen          # regenerate types.ts
 *
 * CI runs the same command and fails if the committed types.ts differs from
 * the generated output (drift gate).
 */

import { compile } from "json-schema-to-typescript";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "lib", "tracking", "schemas");
const outFile = path.join(root, "lib", "tracking", "types.ts");

/** page_viewed → PageViewedEvent */
function typeNameFor(schemaId) {
  return (
    schemaId
      .split("_")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join("") + "Event"
  );
}

function unionFromEnum(values) {
  return values.map((v) => JSON.stringify(v)).join(" | ");
}

const files = (await readdir(schemaDir)).filter((f) => f.endsWith(".json")).sort();

const schemas = [];
for (const file of files) {
  const schema = JSON.parse(await readFile(path.join(schemaDir, file), "utf8"));
  if (!schema.$id) throw new Error(`${file}: schema is missing $id`);
  schemas.push({ file, schema, name: typeNameFor(schema.$id) });
}

// Shared aliases derived from the schemas themselves (not hand-maintained).
const consentEnum = schemas[0].schema.properties.consent_state?.enum;
if (!consentEnum) throw new Error("expected a consent_state enum on every event schema");
const categoryEnum = schemas.find((s) => s.schema.$id === "destination_viewed")
  ?.schema.properties.destination.properties.category.enum;
if (!categoryEnum) throw new Error("expected destination_viewed category enum");

const compiled = [];
for (const { schema, name } of schemas) {
  const out = await compile(
    // Override the title so the generated interface gets the public name the
    // app imports (PageViewedEvent, …) instead of the schema title.
    { ...schema, title: name },
    name,
    { bannerComment: "", additionalProperties: false }
  );
  compiled.push(out.trimEnd());
}

const header = `/* eslint-disable */
/**
 * AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Generated from lib/tracking/schemas/*.json by \`npm run codegen\`
 * (scripts/generate-types.mjs). The JSON Schemas are the single source of
 * truth for event shape; ajv validates against them at runtime and this file
 * mirrors them for compile time. CI fails if this file drifts from the
 * schemas, so regenerate after any schema change.
 */

export type ConsentState = ${unionFromEnum(consentEnum)};
export type DestinationCategory = ${unionFromEnum(categoryEnum)};
`;

const footer = `export type TrackedEvent =
${schemas.map(({ name }) => `  | ${name}`).join("\n")};

/** What callers pass to trackEvent: everything except the stamped fields. */
export type EventInput<T extends TrackedEvent> = Omit<
  T,
  "event_id" | "timestamp" | "consent_state"
>;
`;

const output = [header, ...compiled, footer].join("\n") + "";
await writeFile(outFile, output.endsWith("\n") ? output : output + "\n");
console.log(
  `generated ${path.relative(root, outFile)} from ${schemas.length} schemas: ${schemas
    .map((s) => s.schema.$id)
    .join(", ")}`
);
