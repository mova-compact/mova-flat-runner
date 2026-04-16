import type { ValidatorFn } from "../types.js";

export const poValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "po.validate_inputs_v0",
    fn: (inputs) => {
      const po  = String(inputs.po_id                || "");
      const emp = String(inputs.approver_employee_id || "");
      const po_ok  = po.length  >= 3;
      const emp_ok = emp.length >= 3;
      return {
        ok: true,
        value: { inputs_valid: po_ok && emp_ok, po_id_present: po_ok, approver_present: emp_ok },
        step_id: "validate_inputs",
      };
    },
  },
];
