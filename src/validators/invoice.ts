import type { ValidatorFn } from "../types.js";

export const invoiceValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "invoice.validate_totals_v0",
    fn: (inputs) => {
      const sub   = Math.round((Number(inputs.subtotal)     || 0) * 100);
      const tax   = Math.round((Number(inputs.tax_amount)   || 0) * 100);
      const total = Math.round((Number(inputs.total_amount) || 0) * 100);
      const diff  = Math.abs(sub + tax - total);
      return {
        ok: true,
        value: {
          totals_valid:   diff <= 5,
          expected_total: (sub + tax) / 100,
          actual_total:   total / 100,
          diff_cents:     diff,
        },
        step_id: "validate_totals",
      };
    },
  },
  {
    id: "invoice.validate_dates_v0",
    fn: (inputs) => {
      const inv = String(inputs.invoice_date || "");
      const due = String(inputs.due_date     || "");
      const fmt = /^\d{4}-\d{2}-\d{2}$/;
      const inv_ok   = fmt.test(inv);
      const due_ok   = fmt.test(due);
      const order_ok = !inv_ok || !due_ok || due >= inv;
      return {
        ok: true,
        value: {
          dates_valid:   inv_ok && due_ok && order_ok,
          invoice_date:  inv,
          due_date:      due,
          format_ok:     inv_ok && due_ok,
          order_ok,
        },
        step_id: "validate_dates",
      };
    },
  },
  {
    id: "invoice.validate_amounts_v0",
    fn: (inputs) => {
      const sub   = Number(inputs.subtotal);
      const tax   = Number(inputs.tax_amount);
      const total = Number(inputs.total_amount);
      return {
        ok: true,
        value: {
          amounts_valid: sub > 0 && tax >= 0 && total > 0,
          subtotal:      sub,
          tax_amount:    tax,
          total_amount:  total,
        },
        step_id: "validate_amounts",
      };
    },
  },
];
