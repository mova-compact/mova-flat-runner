import type { ValidatorFn } from "../types.js";

export const contractGenValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "contract_gen.validate_inputs_v0",
    fn: (inputs) => {
      const a    = String(inputs.party_a        || "").trim();
      const b    = String(inputs.party_b        || "").trim();
      const date = String(inputs.effective_date || "");
      const a_ok             = a.length >= 2;
      const b_ok             = b.length >= 2;
      const date_ok          = /^\d{4}-\d{2}-\d{2}$/.test(date);
      const parties_distinct = a.toLowerCase() !== b.toLowerCase();
      return {
        ok: true,
        value: {
          inputs_valid:      a_ok && b_ok && date_ok && parties_distinct,
          party_a_ok:        a_ok,
          party_b_ok:        b_ok,
          date_ok,
          parties_distinct,
          effective_date:    date,
        },
        step_id: "validate_inputs",
      };
    },
  },
];
