const VALID_FRAMEWORKS = ["gdpr", "pci_dss", "iso_27001", "soc2"];
export const complianceValidators = [
    {
        id: "compliance.validate_inputs_v0",
        fn: (inputs) => {
            const url = String(inputs.document_url || "");
            const fw = String(inputs.framework || "");
            const url_ok = url.startsWith("https://");
            const fw_ok = VALID_FRAMEWORKS.includes(fw);
            const org_ok = String(inputs.org_name || "").trim().length >= 2;
            return {
                ok: true,
                value: {
                    inputs_valid: url_ok && fw_ok && org_ok,
                    url_ok,
                    framework_ok: fw_ok,
                    org_ok,
                    document_url: url,
                    framework: fw,
                },
                step_id: "validate_inputs",
            };
        },
    },
];
