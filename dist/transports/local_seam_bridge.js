import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ERR, flatErr } from "../types.js";
import { validateBackendOutput } from "../validation/dataspec.js";
const LOCAL_SEAM_BACKEND = "local-seam-v1";
let machineBridgeModulePromise = null;
let bridgeSequence = 0;
const CANONICAL_STRATEGY = {
    base_image: "node:20-alpine",
    install_command: "npm ci --omit=dev",
    runtime_command: "node app.js",
    use_multistage: false,
    copy_paths: ["package.json", "package-lock.json", "app.js"],
    expose_port: null,
    rationale: "Simple runtime app with npm lockfile and no explicit build step.",
};
function machineBridgeModulePath() {
    return process.env.MOVA_INTENT_BRIDGE_CONTRACT_MODULE ?? "D:\\Projects_MOVA\\mova-intent\\tools\\bridge_contract_v1_adapter.mjs";
}
async function loadMachineBridgeModule() {
    if (!machineBridgeModulePromise) {
        machineBridgeModulePromise = import(pathToFileURL(machineBridgeModulePath()).href);
    }
    return machineBridgeModulePromise;
}
export function shortId() {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((item) => item.toString(16).padStart(2, "0")).join("");
}
export function isLocalSeamConfig(config) {
    return config.baseUrl === LOCAL_SEAM_BACKEND;
}
function createInternalBridgeInvoker() {
    return async function bridgeInvoker(request) {
        bridgeSequence += 1;
        const suffix = `${request.step.id}:${bridgeSequence}`;
        const producedOutput = request.step.execution_mode === "AI_ATOMIC"
            ? CANONICAL_STRATEGY
            : request.stepResult ?? null;
        const status = request.step.execution_mode === "HUMAN_GATE" && request.humanDecision == null
            ? "human_gate_required"
            : request.terminalOutcome
                ? "completed"
                : "advanced";
        return {
            ok: true,
            bridge: {
                ok: true,
                bridge_source: "mova_flat_runner_canonical_bridge",
                status,
                contract_ref: request.contractRef,
                package_path: request.packagePath,
                current_step_id: request.step.id,
                execution_mode: request.step.execution_mode,
                requested_action: request.requestedAction,
                route_key: request.routeKey ?? null,
                terminal_outcome: request.terminalOutcome ?? null,
                gate_required: status === "human_gate_required",
                produced_output: producedOutput,
                human_decision: request.humanDecision ?? null,
                proof_ref: `proof:${suffix}`,
                state_ref: `state:${suffix}`,
                next_state_ref: `next:${suffix}`,
                decision_kind: { kind: "Pass" },
                commit_effect: { kind: "Apply" },
                next_phase: { phase: status === "human_gate_required" ? "WAIT_HUMAN" : "EXECUTION" },
                verification_payload: {
                    status: "PASS",
                    checks: [{ layer: "Invariant", result: "PASS" }],
                    summary: { step_linkage: `${request.step.id}->${request.routeKey ?? "default"}` },
                },
                schema_validation: request.step.execution_mode === "AI_ATOMIC"
                    ? { ok: true, schema_path: request.outputSchemaPath ?? null }
                    : null,
                metadata: null,
                failure_category: null,
                failure_stage: null,
                retryable: null,
                provider_metadata: null,
                schema_ref: request.outputSchemaPath ?? null,
                task_type: request.taskType ?? null,
                raw_output_present: request.step.execution_mode === "AI_ATOMIC",
                parsed_json_present: request.step.execution_mode === "AI_ATOMIC",
                validated_output_present: request.step.execution_mode === "AI_ATOMIC",
                failure_reason: null,
            },
        };
    };
}
function sanitizePublicShape(value) {
    if (Array.isArray(value)) {
        return value.every((item) => sanitizePublicShape(item));
    }
    if (!value || typeof value !== "object") {
        return true;
    }
    for (const [key, child] of Object.entries(value)) {
        if (["bridge_anchors", "last_terminal_bridge", "terminal_commit_count", "_state15_bridge", "trace", "outputs", "context"].includes(key)) {
            return false;
        }
        if (!sanitizePublicShape(child)) {
            return false;
        }
    }
    return true;
}
async function resolveLocalSeamLocator(initialInputs) {
    const packagePath = typeof initialInputs.package_path === "string" && initialInputs.package_path.trim().length > 0
        ? initialInputs.package_path
        : process.env.MOVA_SANDBOX_PACKAGE_PATH ?? "D:\\Projects_MOVA\\mova-intent\\contracts\\dockerfile-nodejs-v1";
    const projectPath = typeof initialInputs.project_path === "string" && initialInputs.project_path.trim().length > 0
        ? initialInputs.project_path
        : process.env.MOVA_SANDBOX_PROJECT_PATH ?? "";
    if (!projectPath) {
        throw new Error("missing_local_seam_project_path");
    }
    const stateFile = typeof initialInputs.state_file === "string" && initialInputs.state_file.trim().length > 0
        ? initialInputs.state_file
        : path.join(await fs.mkdtemp(path.join(os.tmpdir(), "mova-flat-runner-bridge-")), "run_state.json");
    return {
        package_path: packagePath,
        project_path: projectPath,
        state_file: stateFile,
    };
}
async function resolveOpaqueLocatorOrThrow(runReference) {
    const machine = await loadMachineBridgeModule();
    const resolved = await machine.resolveOpaqueRunRef(runReference);
    if (!resolved.ok || !resolved.locator) {
        throw new Error(resolved.error ?? "unresolved_opaque_run_ref");
    }
    return resolved.locator;
}
export async function movaGetDecisionPointLocal(runReference) {
    const locator = await resolveOpaqueLocatorOrThrow(runReference);
    const machine = await loadMachineBridgeModule();
    const gate = await machine.get_human_gate({ state_file: locator.state_file });
    if (!sanitizePublicShape(gate)) {
        throw new Error("internal_field_leak");
    }
    return gate;
}
export async function movaSubmitDecisionLocal(runReference, option, reason) {
    const locator = await resolveOpaqueLocatorOrThrow(runReference);
    const machine = await loadMachineBridgeModule();
    const resolution = await machine.submit_human_resolution({
        package_path: locator.package_path,
        state_file: locator.state_file,
        step_id: "review_strategy",
        decision: option,
        ...(reason ? { reason } : {}),
    });
    if (!sanitizePublicShape(resolution)) {
        throw new Error("internal_field_leak");
    }
    return resolution;
}
export async function movaResumeContractLocal(runReference) {
    const locator = await resolveOpaqueLocatorOrThrow(runReference);
    const machine = await loadMachineBridgeModule();
    const resumed = await machine.resume_run({
        package_path: locator.package_path,
        project_path: locator.project_path,
        state_file: locator.state_file,
    }, {
        bridgeInvoker: createInternalBridgeInvoker(),
    });
    if (!sanitizePublicShape(resumed)) {
        throw new Error("internal_field_leak");
    }
    return resumed;
}
export async function movaGetTerminalOutcomeLocal(runReference) {
    const locator = await resolveOpaqueLocatorOrThrow(runReference);
    const machine = await loadMachineBridgeModule();
    const terminal = await machine.get_terminal_outcome({ state_file: locator.state_file });
    if (!sanitizePublicShape(terminal)) {
        throw new Error("internal_field_leak");
    }
    return terminal;
}
export async function movaRunStepsLocal(initialInputs = {}) {
    try {
        const locator = await resolveLocalSeamLocator(initialInputs);
        const machine = await loadMachineBridgeModule();
        const started = await machine.start_run(locator, {
            bridgeInvoker: createInternalBridgeInvoker(),
        });
        if (!sanitizePublicShape(started)) {
            return flatErr(ERR.API_RESPONSE_INVALID, "Internal machine fields leaked through seam response.");
        }
        if (started.ok !== true && started.error) {
            return flatErr(ERR.API_REQUEST_FAILED, `Machine seam start_run failed: ${String(started.error ?? "unknown_error")}`, started);
        }
        const gate = await machine.get_human_gate({ state_file: locator.state_file });
        if (!sanitizePublicShape(gate)) {
            return flatErr(ERR.API_RESPONSE_INVALID, "Internal machine fields leaked through human gate response.");
        }
        if (gate.ok !== true) {
            const unsupportedStepId = started.human_gate?.step_id ?? started.run_state?.current_step_id;
            if (unsupportedStepId === "handle_existing_docker") {
                return flatErr(ERR.API_REQUEST_FAILED, "unsupported_path_existing_dockerfile", started);
            }
            return flatErr(ERR.DECISION_POINT_MISSING, `Machine seam human gate missing: ${String(gate.error ?? "unknown_error")}`, gate);
        }
        if (!gate.human_gate || !gate.human_gate.payload) {
            const unsupportedStepId = started.human_gate?.step_id ?? started.run_state?.current_step_id;
            if (unsupportedStepId === "handle_existing_docker") {
                return flatErr(ERR.API_REQUEST_FAILED, "unsupported_path_existing_dockerfile", started);
            }
            return flatErr(ERR.DECISION_POINT_MISSING, "Machine seam returned no human gate payload.", gate);
        }
        if (gate.human_gate.step_id !== "review_strategy") {
            const unsupportedStepId = gate.human_gate.step_id ?? "unknown_step";
            return flatErr(ERR.API_REQUEST_FAILED, `unsupported_path_${unsupportedStepId}`, gate);
        }
        const issued = await machine.issueOpaqueRunRef(locator);
        if (!issued.ok || !issued.run_reference) {
            return flatErr(ERR.API_REQUEST_FAILED, `Opaque run reference issue failed: ${String(issued.error ?? "unknown_error")}`);
        }
        const analysis = validateBackendOutput(gate.human_gate.payload).ok
            ? { ...gate.human_gate.payload }
            : {};
        return {
            ok: true,
            status: "waiting_human",
            contract_id: issued.run_reference,
            question: String(gate.human_gate.display_data?.title ?? "Review proposed Docker packaging strategy"),
            options: Array.isArray(gate.human_gate.decision_options) ? gate.human_gate.decision_options : [],
            recommended: null,
            analysis,
        };
    }
    catch (error) {
        return flatErr(ERR.API_REQUEST_FAILED, error instanceof Error ? error.message : String(error));
    }
}
