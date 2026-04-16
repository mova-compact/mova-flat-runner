export const amlValidators = [
    {
        id: "aml.validate_policy_flags_v0",
        fn: (inputs) => {
            const sanctions = Boolean(inputs.sanctions_match);
            const pep = Boolean(inputs.pep_status);
            const score = Number(inputs.risk_score) || 0;
            const score_ok = score >= 0 && score <= 100;
            const mandatory_escalate = sanctions || pep || score > 85;
            const auto_clear = (score <= 30 &&
                !sanctions &&
                !pep &&
                (!inputs.historical_alerts || inputs.historical_alerts.length === 0));
            return {
                ok: true,
                value: {
                    policy_flags_valid: score_ok,
                    sanctions_match: sanctions,
                    pep_status: pep,
                    risk_score: score,
                    mandatory_escalate,
                    auto_clear_eligible: auto_clear,
                },
                step_id: "validate_policy_flags",
            };
        },
    },
];
