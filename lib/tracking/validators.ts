/**
 * Shared JSON-Schema validator registry.
 *
 * Isomorphic on purpose (no "use client"): the browser tracker validates
 * before a payload ever ships (lib/tracking/trackEvent.ts) and the first-party
 * collect endpoint re-validates on ingest (app/api/collect/route.ts). Same
 * ajv-compiled schemas at both edges — the schema is the single contract for
 * dev-time types (via codegen), client validation, and server validation.
 */

import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import pageViewedSchema from "./schemas/page_viewed.json";
import destinationViewedSchema from "./schemas/destination_viewed.json";
import destinationSavedSchema from "./schemas/destination_saved.json";
import ctaClickedSchema from "./schemas/cta_clicked.json";
import personalizationDecidedSchema from "./schemas/personalization_decided.json";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

export const validators: Record<string, ValidateFunction> = {
  page_viewed: ajv.compile(pageViewedSchema),
  destination_viewed: ajv.compile(destinationViewedSchema),
  destination_saved: ajv.compile(destinationSavedSchema),
  cta_clicked: ajv.compile(ctaClickedSchema),
  personalization_decided: ajv.compile(personalizationDecidedSchema),
};

/** Returns the compiled validator for an event name, or undefined if unknown. */
export function getValidator(eventName: string): ValidateFunction | undefined {
  return validators[eventName];
}
