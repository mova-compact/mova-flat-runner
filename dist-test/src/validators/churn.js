export const churnValidators = [
    {
        id: "churn.validate_inputs_v0",
        fn: (inputs) => {
            const threshold = Number(inputs.threshold);
            const period = Number(inputs.period_days);
            const threshold_ok = threshold >= 0.0 && threshold <= 1.0;
            const period_ok = Number.isInteger(period) && period > 0;
            return {
                ok: true,
                value: { inputs_valid: threshold_ok && period_ok, threshold, period_days: period, threshold_ok, period_ok },
                step_id: "validate_inputs",
            };
        },
    },
];
