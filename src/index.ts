#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  movaPost, movaGet, movaPut, movaDelete,
  movaRunSteps, shortId, type MovaConfig,
} from "./client.js";
import { CONTRACT_MANIFESTS, ENVELOPE_SCHEMA } from "./schemas.js";
import { ERR, flatErr, type ValidatorRef } from "./types.js";
import { validateDataSpec, validateFlowShape } from "./validation/dataspec.js";

const RUNNER_VERSION = "2.0.2";

// ── Config helpers ────────────────────────────────────────────────────────────
//
// cfgBase — only MOVA_API_KEY required. Used for query/registry/decide/connector.
// cfgFull — also requires LLM_KEY.  Used for mova_run (LLM calls).

function cfgBase(): MovaConfig {
  const apiKey = process.env.MOVA_API_KEY;
  if (!apiKey) throw new Error(JSON.stringify(flatErr(
    ERR.CONFIG_MISSING, "MOVA_API_KEY environment variable is not set.",
  )));
  return {
    apiKey,
    baseUrl:  process.env.MOVA_API_URL ?? "https://api.mova-lab.eu",
    llmKey:   "",
    llmModel: "",
  };
}

function cfgFull(): MovaConfig {
  const base   = cfgBase();
  const llmKey = process.env.LLM_KEY;
  if (!llmKey) throw new Error(JSON.stringify(flatErr(
    ERR.CONFIG_MISSING, "LLM_KEY is required for contract execution (mova_run).",
  )));
  return { ...base, llmKey, llmModel: process.env.LLM_MODEL ?? "openai/gpt-4o-mini" };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

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
        option:      { type: "string", description: "Decision option_id from the decision gate (e.g. approve, reject, escalate)" },
        reason:      { type: "string", description: "Human reasoning for the decision" },
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
        action:       { type: "string", enum: ["list_overrides", "register", "delete"] },
        connector_id: { type: "string", description: "e.g. connector.ocr.document_extract_v1" },
        endpoint:     { type: "string", description: "Your HTTPS endpoint URL" },
        label:        { type: "string" },
        auth_header:  { type: "string", description: "Auth header name, e.g. X-Api-Key" },
        auth_value:   { type: "string", description: "Secret value — never echoed back in the response" },
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
        action:              { type: "string", enum: ["list", "register", "set_visibility", "delete", "run", "run_status"] },
        contract_id:         { type: "string" },
        run_id:              { type: "string", description: "run_id from a previous run action" },
        source_url:          { type: "string", description: "HTTPS URL to the contract JSON" },
        title:               { type: "string" },
        version:             { type: "string" },
        execution_mode:      { type: "string", description: "deterministic | bounded_variance | ai_assisted | human_gated" },
        description:         { type: "string" },
        required_connectors: { type: "array", items: { type: "string" } },
        visibility:          { type: "string", description: "private or public" },
        inputs:              { type: "object", description: "Input key-value pairs for run action" },
        connector_overrides: { type: "object", description: "Per-run connector overrides" },
      },
      required: ["action"],
    },
  },
  {
    name: "mova_health",
    description: "Check MOVA runner health: config completeness, API connectivity, registered validator count, version.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
] as const;

// ── Resources ─────────────────────────────────────────────────────────────────

const RESOURCES = [
  { uri: "mova://registry",         name: "MOVA Contract Registry",  description: "Index of all built-in contract types with their DataSpec resource URIs.",         mimeType: "application/json" },
  { uri: "mova://schemas/envelopes", name: "MOVA Envelope Schemas",   description: "JSON schemas for all MOVA envelope types.",                                       mimeType: "application/json" },
];

const RESOURCE_TEMPLATES = [
  { uriTemplate: "mova://contracts/{contract_type}/manifest", name: "Contract Manifest", description: "Full manifest for a built-in MOVA contract: DataSpec, decision options, execution mode.", mimeType: "application/json" },
];

function readResource(uri: string): unknown {
  if (uri === "mova://registry") {
    return {
      schema_version: "1.0",
      contracts: Object.values(CONTRACT_MANIFESTS).map(m => ({
        contract_type:     m.contract_type,
        title:             m.title,
        version:           m.version,
        execution_mode:    m.execution_mode,
        manifest_resource: `mova://contracts/${m.contract_type}/manifest`,
      })),
    };
  }
  if (uri === "mova://schemas/envelopes") return ENVELOPE_SCHEMA;

  const manifestMatch = uri.match(/^mova:\/\/contracts\/([^/]+)\/manifest$/);
  if (manifestMatch) {
    const type = manifestMatch[1];
    const manifest = CONTRACT_MANIFESTS[type];
    if (!manifest) throw new Error(`No manifest for contract_type "${type}". Available: ${Object.keys(CONTRACT_MANIFESTS).join(", ")}`);
    return {
      contract_type:    manifest.contract_type,
      title:            manifest.title,
      version:          manifest.version,
      execution_mode:   manifest.execution_mode,
      template_id:      manifest.template_id,
      policy_id:        manifest.policy_id,
      dataspec:         manifest.dataspec,
      decision_options: manifest.decision_options,
      envelope_hint: {
        kind:    "env.contract.start_v0",
        actor:   { actor_type: "human", actor_id: "<user-id>" },
        payload: {
          template_id:        manifest.template_id,
          policy_profile_ref: manifest.policy_id,
          initial_inputs:     manifest.dataspec.inputs.map(f => ({ key: f.field, value: "<value>" })),
        },
      },
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a safe query string without XSS/injection via URLSearchParams. */
function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Redact fields that may contain secrets before returning to the agent. */
function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const key of ["auth_value", "Authorization", "X-LLM-Key", "api_key", "secret"]) {
    if (key in out) out[key] = "[REDACTED]";
  }
  return out;
}

/** Normalize a caught error into a JSON string. */
function normalizeError(e: unknown, requestId?: string): string {
  const code      = (e as { code?: string }).code ?? ERR.API_REQUEST_FAILED;
  const retryable = Boolean((e as { retryable?: boolean }).retryable);
  const msg       = e instanceof Error ? e.message : String(e);
  return JSON.stringify(flatErr(code as typeof ERR[keyof typeof ERR], msg, undefined, retryable, requestId));
}

// ── Tool executor ─────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function executeTool(name: string, args: Args): Promise<string> {
  const requestId = shortId();

  switch (name) {

    // ── mova_run ──────────────────────────────────────────────────────────────
    case "mova_run": {
      const contractType = args.contract_type as string;
      const inputs       = (args.inputs ?? {}) as Record<string, unknown>;
      const manifest     = CONTRACT_MANIFESTS[contractType];

      if (!manifest) {
        return JSON.stringify(flatErr(
          ERR.UNKNOWN_CONTRACT_TYPE,
          `Unknown contract_type "${contractType}". For custom contracts use mova_contract action=run.`,
          { available: Object.keys(CONTRACT_MANIFESTS) },
          false, requestId,
        ));
      }

      // Flow shape guard — verify manifest before sending anything to backend
      const flowCheck = validateFlowShape(manifest.steps as unknown[]);
      if (!flowCheck.ok) {
        return JSON.stringify(flatErr(ERR.UNSUPPORTED_FLOW_SHAPE, flowCheck.error!, undefined, false, requestId));
      }

      // DataSpec validation — types, formats, enums, required
      const dsCheck = validateDataSpec(inputs, manifest.dataspec.inputs);
      if (!dsCheck.ok) {
        return JSON.stringify(flatErr(
          ERR.LOCAL_VALIDATION_FAILED,
          `Input validation failed for contract_type "${contractType}".`,
          { errors: dsCheck.errors, hint: `Read mova://contracts/${contractType}/manifest for the full DataSpec.` },
          false, requestId,
        ));
      }

      let config: MovaConfig;
      try { config = cfgFull(); } catch (e) { return normalizeError(e, requestId); }

      const cid      = `ctr-${manifest.short_id_prefix}-${shortId()}`;
      const kvInputs = manifest.dataspec.inputs
        .filter(f => inputs[f.field] !== undefined)
        .map(f => ({
          key:   f.field,
          value: typeof inputs[f.field] === "string"
            ? inputs[f.field] as string
            : JSON.stringify(inputs[f.field]),
        }));

      try {
        await movaPost(config, "/api/v1/contracts", {
          envelope: {
            kind:        "env.contract.start_v0",
            envelope_id: `env-${shortId()}`,
            contract_id: cid,
            actor:       { actor_type: "human", actor_id: "user" },
            payload: {
              template_id:        manifest.template_id,
              policy_profile_ref: manifest.policy_id,
              initial_inputs:     kvInputs,
            },
          },
          steps: manifest.steps,
        });
      } catch (e) {
        return normalizeError(e, requestId);
      }

      const validators = (manifest.validators ?? []) as ValidatorRef[];
      const result     = await movaRunSteps(config, cid, validators);
      return JSON.stringify(result);
    }

    // ── mova_decide ───────────────────────────────────────────────────────────
    case "mova_decide": {
      let config: MovaConfig;
      try { config = cfgBase(); } catch (e) { return normalizeError(e, requestId); }

      const cid    = args.contract_id as string;
      const option = args.option as string;

      // Fetch current decision point for option validation
      let dp: Record<string, unknown> = {};
      try {
        const dpResp = await movaGet(config, `/api/v1/contracts/${cid}/decision`) as Record<string, unknown>;
        dp = (dpResp.decision_point ?? {}) as Record<string, unknown>;
      } catch (e) {
        return normalizeError(e, requestId);
      }

      // Validate option locally before submitting
      const validOptions = (dp.options as Array<{ option_id: string }> | undefined ?? []);
      if (validOptions.length > 0 && !validOptions.some(o => o.option_id === option)) {
        return JSON.stringify(flatErr(
          ERR.LOCAL_INVALID_DECISION_OPTION,
          `Option "${option}" is not valid for this decision gate.`,
          { valid_options: validOptions.map(o => o.option_id), provided: option },
          false, requestId,
        ));
      }

      try {
        const result = await movaPost(config, `/api/v1/contracts/${cid}/decision`, {
          envelope: {
            kind:              "env.decision.submit_v0",
            envelope_id:       `env-${shortId()}`,
            contract_id:       cid,
            decision_point_id: dp.decision_point_id ?? "",
            actor:             { actor_type: "human", actor_id: "user" },
            payload: {
              selected_option_id: option,
              selection_reason:   (args.reason as string | undefined) ?? "decision via MOVA MCP",
            },
          },
        }) as Record<string, unknown>;

        if (!result.ok) return JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, "Decision submission failed", result, false, requestId));

        const audit = await movaGet(config, `/api/v1/contracts/${cid}/audit`) as Record<string, unknown>;
        return JSON.stringify({ ok: true, status: "completed", contract_id: cid, decision: option, audit_receipt: audit.audit_receipt ?? {} });
      } catch (e) {
        return normalizeError(e, requestId);
      }
    }

    // ── mova_query ────────────────────────────────────────────────────────────
    case "mova_query": {
      let config: MovaConfig;
      try { config = cfgBase(); } catch (e) { return normalizeError(e, requestId); }

      const cid = args.contract_id as string;
      try {
        switch (args.view) {
          case "status":
            return JSON.stringify(await movaGet(config, `/api/v1/contracts/${cid}`));
          case "audit":
            return JSON.stringify(await movaGet(config, `/api/v1/contracts/${cid}/audit`));
          case "audit_compact": {
            const url = `${config.baseUrl.replace(/\/$/, "")}/api/v1/contracts/${cid}/audit/compact/sidecar.jsonl`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${config.apiKey}` } });
            return JSON.stringify({ ok: res.ok, status: res.status, journal: await res.text() });
          }
          default:
            return JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, `Unknown view "${args.view}". Use: status | audit | audit_compact`));
        }
      } catch (e) {
        return normalizeError(e, requestId);
      }
    }

    // ── mova_registry ─────────────────────────────────────────────────────────
    case "mova_registry": {
      let config: MovaConfig;
      try { config = cfgBase(); } catch (e) { return normalizeError(e, requestId); }

      const q = qs({ keyword: args.keyword as string | undefined });
      try {
        switch (args.scope) {
          case "contracts":
            try {
              return JSON.stringify(await movaGet(config, `/api/v1/registry/contracts${q}`));
            } catch {
              return JSON.stringify({
                ok: true, source: "local",
                contracts: Object.values(CONTRACT_MANIFESTS).map(m => ({
                  contract_type:     m.contract_type,
                  title:             m.title,
                  version:           m.version,
                  execution_mode:    m.execution_mode,
                  manifest_resource: `mova://contracts/${m.contract_type}/manifest`,
                })),
              });
            }
          case "connectors":
            return JSON.stringify(await movaGet(config, `/api/v1/connectors${q}`));
          case "my_contracts":
            return JSON.stringify(await movaGet(config, `/api/v1/contracts/my${q}`));
          default:
            return JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, `Unknown scope "${args.scope}". Use: contracts | connectors | my_contracts`));
        }
      } catch (e) {
        return normalizeError(e, requestId);
      }
    }

    // ── mova_connector ────────────────────────────────────────────────────────
    case "mova_connector": {
      let config: MovaConfig;
      try { config = cfgBase(); } catch (e) { return normalizeError(e, requestId); }

      try {
        switch (args.action) {
          case "list_overrides":
            return JSON.stringify(await movaGet(config, "/api/v1/connectors/overrides"));
          case "register": {
            const resp = await movaPost(config, "/api/v1/connectors/overrides", {
              connector_id: args.connector_id,
              endpoint:     args.endpoint,
              label:        args.label,
              auth_header:  args.auth_header,
              auth_value:   args.auth_value,   // sent to backend but redacted in response
            }) as Record<string, unknown>;
            return JSON.stringify(redactSecrets(resp));
          }
          case "delete":
            return JSON.stringify(await movaDelete(config, `/api/v1/connectors/overrides/${args.connector_id}`));
          default:
            return JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, `Unknown action "${args.action}". Use: list_overrides | register | delete`));
        }
      } catch (e) {
        return normalizeError(e, requestId);
      }
    }

    // ── mova_contract ─────────────────────────────────────────────────────────
    case "mova_contract": {
      const needsLlm = args.action === "run";
      let config: MovaConfig;
      try { config = needsLlm ? cfgFull() : cfgBase(); } catch (e) { return normalizeError(e, requestId); }

      const q = qs({ keyword: args.keyword as string | undefined });
      try {
        switch (args.action) {
          case "list":
            return JSON.stringify(await movaGet(config, `/api/v1/contracts/my${q}`));
          case "register":
            return JSON.stringify(await movaPost(config, "/api/v1/contracts/register", {
              source_url:          args.source_url,
              title:               args.title,
              version:             args.version,
              execution_mode:      args.execution_mode,
              description:         args.description,
              required_connectors: args.required_connectors ?? [],
              visibility:          args.visibility ?? "private",
            }));
          case "set_visibility":
            return JSON.stringify(await movaPut(config, `/api/v1/contracts/${args.contract_id}/visibility`, { visibility: args.visibility }));
          case "delete":
            return JSON.stringify(await movaDelete(config, `/api/v1/contracts/${args.contract_id}`));
          case "run":
            return JSON.stringify(await movaPost(config, `/run/${args.contract_id}`, {
              inputs:              args.inputs ?? {},
              connector_overrides: args.connector_overrides ?? {},
            }));
          case "run_status":
            return JSON.stringify(await movaGet(config, `/run/${args.run_id}/status`));
          default:
            return JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, `Unknown action "${args.action}". Use: list | register | set_visibility | delete | run | run_status`));
        }
      } catch (e) {
        return normalizeError(e, requestId);
      }
    }

    // ── mova_health ───────────────────────────────────────────────────────────
    case "mova_health": {
      let config: MovaConfig;
      try { config = cfgBase(); } catch (e) { return normalizeError(e, requestId); }

      const checks: Record<string, unknown> = {
        runner_version:    RUNNER_VERSION,
        mova_api_key:      !!process.env.MOVA_API_KEY,
        llm_key_present:   !!process.env.LLM_KEY,   // only needed for mova_run
        api_url:           config.baseUrl,
        manifest_count:    Object.keys(CONTRACT_MANIFESTS).length,
        timeout_ms:        parseInt(process.env.MOVA_API_TIMEOUT_MS ?? "30000", 10),
      };

      try {
        const h = await movaGet(config, "/health") as Record<string, unknown>;
        checks.api_status   = "reachable";
        checks.api_response = h;
      } catch (e) {
        checks.api_status = "unreachable";
        checks.api_error  = e instanceof Error ? e.message : String(e);
      }

      return JSON.stringify({ ok: true, request_id: requestId, checks });
    }

    default:
      return JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, `Unknown tool: "${name}"`, undefined, false, requestId));
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

function buildServer(): Server {
  const srv = new Server(
    { name: "mova-mcp", version: RUNNER_VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await executeTool(name, (args ?? {}) as Args);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If the message is already a JSON error envelope, return it as-is
      try { JSON.parse(msg); return { content: [{ type: "text", text: msg }], isError: true }; } catch { /* not JSON */ }
      return { content: [{ type: "text", text: JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, msg)) }], isError: true };
    }
  });

  srv.setRequestHandler(ListResourcesRequestSchema,         async () => ({ resources: RESOURCES }));
  srv.setRequestHandler(ListResourceTemplatesRequestSchema,  async () => ({ resourceTemplates: RESOURCE_TEMPLATES }));

  srv.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      const data = readResource(uri);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  });

  return srv;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data",  (c: Buffer) => chunks.push(c));
    req.on("end",   () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ── Transport ─────────────────────────────────────────────────────────────────

const httpPort = parseInt(process.env.MOVA_HTTP_PORT ?? "0", 10);

if (httpPort > 0) {
  const httpServer = createServer(async (req, res) => {
    if (req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const srv       = buildServer();
      await srv.connect(transport);
      await transport.handleRequest(req, res);

    } else if (req.url === "/invoke" && req.method === "POST") {
      try {
        const body               = await readBody(req);
        const { tool, args }     = JSON.parse(body) as { tool: string; args: Record<string, unknown> };
        const result             = await executeTool(tool, args as Args);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify(flatErr(ERR.API_REQUEST_FAILED, msg)));
      }

    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "mova-mcp", version: RUNNER_VERSION }));

    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(httpPort, () => {
    process.stderr.write(`mova-mcp v${RUNNER_VERSION} HTTP listening on port ${httpPort} (/mcp, /invoke, /health)\n`);
  });

} else {
  const transport = new StdioServerTransport();
  const srv       = buildServer();
  await srv.connect(transport);
}
