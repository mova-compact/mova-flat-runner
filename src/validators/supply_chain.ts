import type { ValidatorFn } from "../types.js";

export const supplyChainValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "supply_chain.validate_inputs_v0",
    fn: (inputs) => {
      const suppliers = Array.isArray(inputs.suppliers) ? inputs.suppliers as Record<string, unknown>[] : [];
      const non_empty    = suppliers.length > 0;
      const valid_items  = suppliers.filter(s =>
        s &&
        typeof s === "object" &&
        String(s["id"]      || "").length > 0 &&
        String(s["name"]    || "").length > 0 &&
        /^[A-Z]{2}$/.test(String(s["country"] || ""))
      );
      const invalid_count = suppliers.length - valid_items.length;
      return {
        ok: true,
        value: {
          inputs_valid:          non_empty && invalid_count === 0,
          supplier_count:        suppliers.length,
          valid_supplier_count:  valid_items.length,
          invalid_supplier_count: invalid_count,
          has_suppliers:         non_empty,
        },
        step_id: "validate_inputs",
      };
    },
  },
];
