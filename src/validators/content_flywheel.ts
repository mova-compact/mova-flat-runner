import type { ValidatorFn } from "../types.js";

const LAYERS = [
  "LAYER_01_DREAM_ENTRY",
  "LAYER_02_BELIEF_BRIDGE",
  "LAYER_03_REVENUE_PROCESS_METHOD",
  "LAYER_04_MOVA_ECOSYSTEM_FORK",
  "LAYER_05_PROOF_AND_TRUST",
] as const;

const ROUTE_INTENTS = [
  "BUSINESS_AUTOMATION_WITH_CONTRACTS",
  "PRODUCT_CREATION_WITH_CONTRACT_CODING",
  "BOTH",
  "UNDECIDED",
] as const;

export const contentFlywheelValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "content_flywheel.validate_intent_v0",
    fn: (inputs) => {
      const layer = String(inputs.flywheel_layer || "");
      const route = String(inputs.route_intent || "UNDECIDED");
      const layerIndex = LAYERS.indexOf(layer as (typeof LAYERS)[number]);
      const layerKnown = layerIndex >= 0;
      const routeKnown = (ROUTE_INTENTS as readonly string[]).includes(route);
      return {
        ok: layerKnown && routeKnown,
        value: {
          flywheel_layer_known: layerKnown,
          flywheel_layer_index: layerKnown ? layerIndex + 1 : null,
          route_intent_known: routeKnown,
          route_intent: route,
          human_review_required: true,
          publication_allowed: false,
        },
        step_id: "validate_intent",
      };
    },
  },
];
