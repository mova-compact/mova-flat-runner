#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListResourceTemplatesRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { movaPost, movaGet, movaPut, movaDelete, movaRunSteps, shortId, } from "./client.js";
import { CONTRACT_MANIFESTS, ENVELOPE_SCHEMA } from "./schemas.js";
// ── Config ────────────────────────────────────────────────────────────────────
function cfg() {
    const apiKey = process.env.MOVA_API_KEY;
    const llmKey = process.env.LLM_KEY;
    if (!apiKey)
        throw new Error("MOVA_API_KEY environment variable is not set.");
    if (!llmKey)
        throw new Error("LLM_KEY environment variable is not set.");
    return {
        apiKey,
        baseUrl: process.env.MOVA_API_URL ?? "https://api.mova-lab.eu",
        llmKey,
        llmModel: process.env.LLM_MODEL ?? "openai/gpt-4o-mini",
    };
}
// ── Tool definitions — 6 generic primitives ───────────────────────────────────
//
// Layer contract:
//   mova_run       → ENV env.contract.start_v0  → starts any registered contract
//   mova_decide    → ENV env.decision.submit_v0 → human gate decision
//   mova_query     → status / audit / audit_compact
//   mova_registry  → browse contracts / connectors / my_contracts
//   mova_connector → manage connector overrides
//   mova_contract  → manage user-registered contracts (list/register/run/...)
//
// Business logic lives in CONTRACT_MANIFESTS (schemas.ts) and on the platform.
// No contract-specific code lives here.
const TOOLS = [
    {
        name: "mova_run",
        description: [
            "Start a MOVA contract execution.",
            "Before calling, read the manifest resource mova://contracts/{contract_type}/manifest",
            "to understand required inputs (DataSpec) and available decision options.",
            "Built-in contract types: " + Object.keys(CONTRACT_MANIFESTS).join(", ") + ".",
            "For custom registered contracts use mova_contract with action=run.",
        ].join(" "),
        inputSchema: {
            type: "object",
            properties: {
                contract_type: {
                    type: "string",
                    description: "Built-in type: invoice | po | trade | aml | complaint | compliance | credit | supply_chain | churn | contract_gen",
                },
                inputs: {
                    type: "object",
                    description: "Contract inputs per the DataSpec in the manifest. Read mova://contracts/{contract_type}/manifest first.",
                },
            },
            required: ["contract_type", "inputs"],
        },
    },
    {
        name: "mova_decide",
        description: [
            "Submit a human decision at a contract gate.",
            "Uses ENV kind env.decision.submit_v0.",
            "contract_id comes from the mova_run response, not from business IDs.",
        ].join(" "),
        inputSchema: {
            type: "object",
            properties: {
                contract_id: { type: "string", description: "Contract ID from mova_run response" },
                option: { type: "string", description: "Decision option_id from the decision gate (e.g. approve, reject, escalate)" },
                reason: { type: "string", description: "Human reasoning for the decision" },
            },
            required: ["contract_id", "option"],
        },
    },
    {
        name: "mova_query",
        description: "Query contract state or retrieve the signed audit trail.",
        inputSchema: {
            type: "object",
            properties: {
                contract_id: { type: "string" },
                view: {
                    type: "string",
                    enum: ["status", "audit", "audit_compact"],
                    description: "status = current state | audit = signed receipt | audit_compact = full event journal",
                },
            },
            required: ["contract_id", "view"],
        },
    },
    {
        name: "mova_registry",
        description: "Browse the MOVA contract marketplace, connector catalogue, or your own contracts.",
        inputSchema: {
            type: "object",
            properties: {
                scope: {
                    type: "string",
                    enum: ["contracts", "connectors", "my_contracts"],
                    description: "contracts = public marketplace | connectors = available connectors | my_contracts = your registered contracts",
                },
                keyword: { type: "string", description: "Optional filter keyword" },
            },
            required: ["scope"],
        },
    },
    {
        name: "mova_connector",
        description: "Manage connector overrides for your org. Overrides replace the sandbox mock with your real endpoint.",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["list_overrides", "register", "delete"] },
                connector_id: { type: "string", description: "e.g. connector.ocr.document_extract_v1" },
                endpoint: { type: "string", description: "Your HTTPS endpoint URL" },
                label: { type: "string" },
                auth_header: { type: "string", description: "Auth header name, e.g. X-Api-Key" },
                auth_value: { type: "string" },
            },
            required: ["action"],
        },
    },
    {
        name: "mova_contract",
        description: "Manage your own registered MOVA contracts: list, register, set visibility, delete, run, or check run status.",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["list", "register", "set_visibility", "delete", "run", "run_status"] },
                contract_id: { type: "string" },
                run_id: { type: "string", description: "run_id from a previous run action" },
                source_url: { type: "string", description: "HTTPS URL to the contract JSON" },
                title: { type: "string" },
                version: { type: "string" },
                execution_mode: { type: "string", description: "deterministic | bounded_variance | ai_assisted | human_gated" },
                description: { type: "string" },
                required_connectors: { type: "array", items: { type: "string" } },
                visibility: { type: "string", description: "private or public" },
                inputs: { type: "object", description: "Input key-value pairs for run action" },
                connector_overrides: { type: "object", description: "Per-run connector overrides" },
            },
            required: ["action"],
        },
    },
];
// ── Resource definitions ───────────────────────────────────────────────────────
//
// Resources carry structured JSON — no free text, no prompt logic.
// Agent reads these to understand input schemas (DS) before calling mova_run.
const RESOURCES = [
    {
        uri: "mova://registry",
        name: "MOVA Contract Registry",
        description: "Index of all built-in contract types with their DataSpec resource URIs.",
        mimeType: "application/json",
    },
    {
        uri: "mova://schemas/envelopes",
        name: "MOVA Envelope Schemas",
        description: "JSON schemas for all MOVA envelope types (env.contract.start_v0, env.decision.submit_v0, ...).",
        mimeType: "application/json",
    },
];
const RESOURCE_TEMPLATES = [
    {
        uriTemplate: "mova://contracts/{contract_type}/manifest",
        name: "Contract Manifest",
        description: "Full manifest for a built-in MOVA contract: DataSpec (input schema), decision options, execution mode, template and policy references.",
        mimeType: "application/json",
    },
];
// ── Resource content resolver ─────────────────────────────────────────────────
function readResource(uri) {
    if (uri === "mova://registry") {
        return {
            schema_version: "1.0",
            contracts: Object.values(CONTRACT_MANIFESTS).map(m => ({
                contract_type: m.contract_type,
                title: m.title,
                version: m.version,
                execution_mode: m.execution_mode,
                manifest_resource: `mova://contracts/${m.contract_type}/manifest`,
            })),
        };
    }
    if (uri === "mova://schemas/envelopes") {
        return ENVELOPE_SCHEMA;
    }
    const manifestMatch = uri.match(/^mova:\/\/contracts\/([^/]+)\/manifest$/);
    if (manifestMatch) {
        const type = manifestMatch[1];
        const manifest = CONTRACT_MANIFESTS[type];
        if (!manifest) {
            throw new Error(`No manifest for contract_type "${type}". Available: ${Object.keys(CONTRACT_MANIFESTS).join(", ")}`);
        }
        // Expose schema-level data only — steps are platform internals
        return {
            contract_type: manifest.contract_type,
            title: manifest.title,
            version: manifest.version,
            execution_mode: manifest.execution_mode,
            template_id: manifest.template_id,
            policy_id: manifest.policy_id,
            dataspec: manifest.dataspec,
            decision_options: manifest.decision_options,
            envelope_hint: {
                kind: "env.contract.start_v0",
                actor: { actor_type: "human", actor_id: "<user-id>" },
                payload: {
                    template_id: manifest.template_id,
                    policy_profile_ref: manifest.policy_id,
                    initial_inputs: manifest.dataspec.inputs.map(f => ({ key: f.field, value: "<value>" })),
                },
            },
        };
    }
    throw new Error(`Unknown resource URI: ${uri}`);
}
async function executeTool(name, args) {
    const config = cfg();
    switch (name) {
        // ── mova_run ────────────────────────────────────────────────────────────
        case "mova_run": {
            const contractType = args.contract_type;
            const inputs = (args.inputs ?? {});
            const manifest = CONTRACT_MANIFESTS[contractType];
            if (!manifest) {
                return JSON.stringify({
                    ok: false,
                    error: "UNKNOWN_CONTRACT_TYPE",
                    contract_type: contractType,
                    available: Object.keys(CONTRACT_MANIFESTS),
                    hint: "For custom registered contracts use mova_contract with action=run.",
                });
            }
            // Validate required fields against DataSpec
            const missing = manifest.dataspec.inputs.filter(f => f.required && (inputs[f.field] === undefined || inputs[f.field] === null || inputs[f.field] === ""));
            if (missing.length > 0) {
                return JSON.stringify({
                    ok: false,
                    error: "MISSING_REQUIRED_INPUTS",
                    missing_fields: missing.map(f => ({ field: f.field, type: f.type, description: f.description })),
                    hint: `Read mova://contracts/${contractType}/manifest for the full DataSpec.`,
                });
            }
            const cid = `ctr-${manifest.short_id_prefix}-${shortId()}`;
            const kvInputs = manifest.dataspec.inputs
                .filter(f => inputs[f.field] !== undefined)
                .map(f => ({
                key: f.field,
                value: typeof inputs[f.field] === "string"
                    ? inputs[f.field]
                    : JSON.stringify(inputs[f.field]),
            }));
            await movaPost(config, "/api/v1/contracts", {
                envelope: {
                    kind: "env.contract.start_v0",
                    envelope_id: `env-${shortId()}`,
                    contract_id: cid,
                    actor: { actor_type: "human", actor_id: "user" },
                    payload: {
                        template_id: manifest.template_id,
                        policy_profile_ref: manifest.policy_id,
                        initial_inputs: kvInputs,
                    },
                },
                steps: manifest.steps,
            });
            return JSON.stringify(await movaRunSteps(config, cid, (manifest.validators ?? [])));
        }
        // ── mova_decide ─────────────────────────────────────────────────────────
        case "mova_decide": {
            const cid = args.contract_id;
            const dpResp = await movaGet(config, `/api/v1/contracts/${cid}/decision`);
            const dp = (dpResp.decision_point ?? {});
            const result = await movaPost(config, `/api/v1/contracts/${cid}/decision`, {
                envelope: {
                    kind: "env.decision.submit_v0",
                    envelope_id: `env-${shortId()}`,
                    contract_id: cid,
                    decision_point_id: dp.decision_point_id ?? "",
                    actor: { actor_type: "human", actor_id: "user" },
                    payload: {
                        selected_option_id: args.option,
                        selection_reason: args.reason ?? "decision via MOVA MCP",
                    },
                },
            });
            if (!result.ok)
                return JSON.stringify(result);
            const audit = await movaGet(config, `/api/v1/contracts/${cid}/audit`);
            return JSON.stringify({
                ok: true, status: "completed", contract_id: cid,
                decision: args.option,
                audit_receipt: audit.audit_receipt ?? {},
            });
        }
        // ── mova_query ──────────────────────────────────────────────────────────
        case "mova_query": {
            const cid = args.contract_id;
            switch (args.view) {
                case "status":
                    return JSON.stringify(await movaGet(config, `/api/v1/contracts/${cid}`));
                case "audit":
                    return JSON.stringify(await movaGet(config, `/api/v1/contracts/${cid}/audit`));
                case "audit_compact": {
                    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/v1/contracts/${cid}/audit/compact/sidecar.jsonl`, { headers: { Authorization: `Bearer ${config.apiKey}`, "X-LLM-Key": config.llmKey, "X-LLM-Model": config.llmModel } });
                    return JSON.stringify({ ok: res.ok, status: res.status, journal: await res.text() });
                }
                default:
                    throw new Error(`Unknown view: "${args.view}". Use: status | audit | audit_compact`);
            }
        }
        // ── mova_registry ───────────────────────────────────────────────────────
        case "mova_registry": {
            const kw = args.keyword ? `?keyword=${args.keyword}` : "";
            switch (args.scope) {
                case "contracts":
                    try {
                        return JSON.stringify(await movaGet(config, `/api/v1/registry/contracts${kw}`));
                    }
                    catch {
                        // Fall back to local manifest index
                        return JSON.stringify({
                            ok: true, source: "local",
                            contracts: Object.values(CONTRACT_MANIFESTS).map(m => ({
                                contract_type: m.contract_type,
                                title: m.title,
                                version: m.version,
                                execution_mode: m.execution_mode,
                                manifest_resource: `mova://contracts/${m.contract_type}/manifest`,
                            })),
                        });
                    }
                case "connectors":
                    return JSON.stringify(await movaGet(config, `/api/v1/connectors${kw}`));
                case "my_contracts":
                    return JSON.stringify(await movaGet(config, `/api/v1/contracts/my${kw}`));
                default:
                    throw new Error(`Unknown scope: "${args.scope}". Use: contracts | connectors | my_contracts`);
            }
        }
        // ── mova_connector ──────────────────────────────────────────────────────
        case "mova_connector": {
            switch (args.action) {
                case "list_overrides":
                    return JSON.stringify(await movaGet(config, "/api/v1/connectors/overrides"));
                case "register":
                    return JSON.stringify(await movaPost(config, "/api/v1/connectors/overrides", {
                        connector_id: args.connector_id,
                        endpoint: args.endpoint,
                        label: args.label,
                        auth_header: args.auth_header,
                        auth_value: args.auth_value,
                    }));
                case "delete":
                    return JSON.stringify(await movaDelete(config, `/api/v1/connectors/overrides/${args.connector_id}`));
                default:
                    throw new Error(`Unknown action: "${args.action}". Use: list_overrides | register | delete`);
            }
        }
        // ── mova_contract ───────────────────────────────────────────────────────
        case "mova_contract": {
            switch (args.action) {
                case "list":
                    return JSON.stringify(await movaGet(config, `/api/v1/contracts/my${args.keyword ? `?keyword=${args.keyword}` : ""}`));
                case "register":
                    return JSON.stringify(await movaPost(config, "/api/v1/contracts/register", {
                        source_url: args.source_url,
                        title: args.title,
                        version: args.version,
                        execution_mode: args.execution_mode,
                        description: args.description,
                        required_connectors: args.required_connectors ?? [],
                        visibility: args.visibility ?? "private",
                    }));
                case "set_visibility":
                    return JSON.stringify(await movaPut(config, `/api/v1/contracts/${args.contract_id}/visibility`, { visibility: args.visibility }));
                case "delete":
                    return JSON.stringify(await movaDelete(config, `/api/v1/contracts/${args.contract_id}`));
                case "run":
                    return JSON.stringify(await movaPost(config, `/run/${args.contract_id}`, {
                        inputs: args.inputs ?? {},
                        connector_overrides: args.connector_overrides ?? {},
                    }));
                case "run_status":
                    return JSON.stringify(await movaGet(config, `/run/${args.run_id}/status`));
                default:
                    throw new Error(`Unknown action: "${args.action}". Use: list | register | set_visibility | delete | run | run_status`);
            }
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// ── MCP Server factory ────────────────────────────────────────────────────────
function buildServer() {
    const srv = new Server({ name: "mova-mcp", version: "2.0.0" }, { capabilities: { tools: {}, resources: {} } });
    // Tools
    srv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
    srv.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await executeTool(name, (args ?? {}));
            return { content: [{ type: "text", text: result }] };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }], isError: true };
        }
    });
    // Resources
    srv.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));
    srv.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: RESOURCE_TEMPLATES }));
    srv.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        try {
            const data = readResource(uri);
            return {
                contents: [{
                        uri,
                        mimeType: "application/json",
                        text: JSON.stringify(data, null, 2),
                    }],
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(msg);
        }
    });
    return srv;
}
// ── Helper: read HTTP request body ───────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
// ── Transport ─────────────────────────────────────────────────────────────────
//
// stdio  → Claude Desktop / Claude Code (default)
// HTTP   → proxy / connector mode (set MOVA_HTTP_PORT)
//
//   Endpoints in HTTP mode:
//     GET  /health          → liveness probe
//     POST /mcp             → MCP protocol (streamable-http, SSE)
//     POST /invoke          → direct REST: { tool, args } → JSON (connector endpoint)
const httpPort = parseInt(process.env.MOVA_HTTP_PORT ?? "0", 10);
if (httpPort > 0) {
    const httpServer = createServer(async (req, res) => {
        if (req.url === "/mcp") {
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
            const srv = buildServer();
            await srv.connect(transport);
            await transport.handleRequest(req, res);
        }
        else if (req.url === "/invoke" && req.method === "POST") {
            try {
                const body = await readBody(req);
                const { tool, args } = JSON.parse(body);
                const result = await executeTool(tool, args);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(result);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: msg }));
            }
        }
        else if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, service: "mova-mcp", version: "2.0.0" }));
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    httpServer.listen(httpPort, () => {
        process.stderr.write(`mova-mcp v2 HTTP listening on port ${httpPort} (/mcp, /invoke, /health)\n`);
    });
}
else {
    const transport = new StdioServerTransport();
    const srv = buildServer();
    await srv.connect(transport);
}
