import type { ValidatorFn } from "../types.js";

export const creditValidators: Array<{ id: string; fn: ValidatorFn }> = [
  {
    id: "credit.validate_calcs_v0",
    fn: (inputs) => {
      const income    = Number(inputs.monthly_income)   || 0;
      const debt      = Number(inputs.total_debt)       || 0;
      const bureau    = Number(inputs.bureau_score)     || 0;
      const requested = Number(inputs.requested_amount) || 0;
      const income_ok    = income    >  0;
      const bureau_ok    = bureau    >= 300 && bureau <= 850;
      const requested_ok = requested >  0;
      const dti          = income_ok ? debt / (income * 12) : null;
      const hard_reject  = bureau < 500 || (dti !== null && dti > 0.6);
      return {
        ok: true,
        value: {
          calcs_valid:          income_ok && bureau_ok && requested_ok,
          monthly_income:       income,
          total_debt:           debt,
          bureau_score:         bureau,
          requested_amount:     requested,
          debt_to_income_ratio: dti,
          hard_reject,
          hard_reject_reason:   hard_reject
            ? (bureau < 500 ? "bureau_score_below_500" : "dti_exceeds_60pct")
            : null,
        },
        step_id: "validate_calcs",
      };
    },
  },
];
