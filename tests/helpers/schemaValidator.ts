import Ajv from "ajv";
import addFormats from "ajv-formats";
import pageViewedSchema from "../../lib/tracking/schemas/page_viewed.json";
import destinationViewedSchema from "../../lib/tracking/schemas/destination_viewed.json";
import ctaClickedSchema from "../../lib/tracking/schemas/cta_clicked.json";
import personalizationDecidedSchema from "../../lib/tracking/schemas/personalization_decided.json";

export const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

export const validators = {
  page_viewed: ajv.compile(pageViewedSchema),
  destination_viewed: ajv.compile(destinationViewedSchema),
  cta_clicked: ajv.compile(ctaClickedSchema),
  personalization_decided: ajv.compile(personalizationDecidedSchema),
};
