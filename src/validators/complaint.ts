import type { ValidatorFn } from "../types.js";

export const complaintValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "complaint.validate_inputs_v0",
    fn: (inputs) => {
      const text    = String(inputs.complaint_text  || "");
      const date    = String(inputs.complaint_date  || "");
      const text_ok = text.trim().length >= 10;
      const date_ok = /^\d{4}-\d{2}-\d{2}$/.test(date);
      return {
        ok: true,
        value: {
          inputs_valid: text_ok && date_ok,
          text_length:  text.trim().length,
          text_ok,
          date_ok,
          complaint_date: date,
        },
        step_id: "validate_inputs",
      };
    },
  },
];
