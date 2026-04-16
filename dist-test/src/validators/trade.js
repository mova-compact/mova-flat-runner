export const tradeValidators = [
    {
        id: "trade.validate_limits_v0",
        fn: (inputs) => {
            const lev = Number(inputs.leverage) || 0;
            const size = Number(inputs.order_size_usd) || 0;
            const lev_ok = lev >= 1 && lev <= 100;
            const size_ok = size > 0;
            const hard_reject = lev > 10;
            const mandatory_escalate = size >= 10_000 || lev > 3;
            return {
                ok: true,
                value: {
                    limits_valid: lev_ok && size_ok,
                    leverage: lev,
                    order_size_usd: size,
                    hard_reject,
                    hard_reject_reason: hard_reject ? "leverage_exceeds_10x" : null,
                    mandatory_escalate,
                },
                step_id: "validate_limits",
            };
        },
    },
];
