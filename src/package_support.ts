import fs from "node:fs/promises";
import path from "node:path";

export const PACKAGE_MANIFEST_SCHEMA_ID = "package.contract_package_manifest_v0";
export const PACKAGE_GLOBAL_SCHEMA_ID = "package.global_v0";

type serde_json_like = Record<string, unknown>;

export type PackageRegistrationSource =
  | {
      kind: "inline_flow";
      source_path?: string;
      source_url?: string;
      flow_json: serde_json_like;
    }
  | {
      kind: "package_manifest";
      source_path?: string;
      source_url?: string;
      package_manifest: serde_json_like;
      package_global: serde_json_like | null;
      flow_json: serde_json_like;
    };

function isObject(value: unknown): value is serde_json_like {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonFromPath(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function readJsonFromUrl(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch JSON from ${url}: HTTP ${response.status}`);
  }
  const raw = await response.text();
  return JSON.parse(raw) as unknown;
}

function resolvePackageRef(ref: string, base: string): string {
  if (/^https?:\/\//i.test(base)) {
    return new URL(ref, base).href;
  }
  return path.resolve(base, ref);
}

async function resolveOutputSchema(schemaRef: string, flowDir: string): Promise<Record<string, unknown> | null> {
  const candidates = [
    path.join(flowDir, "_schemas", `${schemaRef}.json`),
    path.join(flowDir, "..", "_data-schemas", `${schemaRef}.json`),
    path.join(flowDir, "..", "..", "_data-schemas", `${schemaRef}.json`),
    ...(process.env.MOVA_SCHEMA_PATH ? [path.join(process.env.MOVA_SCHEMA_PATH, `${schemaRef}.json`)] : []),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function validateRequiredString(obj: serde_json_like, key: string, scope: string): string | null {
  if (typeof obj[key] !== "string" || (obj[key] as string).trim().length === 0) {
    return `${scope} is missing required string field "${key}"`;
  }
  return null;
}

export function validatePackageGlobalShape(value: unknown): string | null {
  if (!isObject(value)) return "global file must be a JSON object";
  const allowedKeys = new Set(["schema_id", "global_id", "version", "scope", "extends", "semantic_roles", "non_authority_rules"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return `global file contains unsupported field "${key}"`;
  }
  if (value.schema_id !== PACKAGE_GLOBAL_SCHEMA_ID) return `global schema_id must be "${PACKAGE_GLOBAL_SCHEMA_ID}"`;
  if (typeof value.global_id !== "string" || value.global_id.trim().length === 0) return "global file is missing required string field \"global_id\"";
  if (typeof value.version !== "string" || value.version.trim().length === 0) return "global file is missing required string field \"version\"";
  if (value.scope !== "contract_package") return "global scope must be \"contract_package\"";
  if (value.extends !== undefined && !Array.isArray(value.extends)) return "global extends must be an array when present";
  if (!Array.isArray(value.semantic_roles) || value.semantic_roles.length === 0) return "global semantic_roles must be a non-empty array";
  if (!Array.isArray(value.non_authority_rules) || value.non_authority_rules.length === 0) return "global non_authority_rules must be a non-empty array";

  for (let index = 0; index < value.semantic_roles.length; index += 1) {
    const role = value.semantic_roles[index];
    if (!isObject(role)) return `global semantic_roles[${index}] must be a JSON object`;
    const roleKeys = new Set(["id", "role", "authority", "maturity", "applies_to", "allowed_use", "forbidden_use", "notes"]);
    for (const key of Object.keys(role)) {
      if (!roleKeys.has(key)) return `global semantic_roles[${index}] contains unsupported field "${key}"`;
    }
    for (const key of ["id", "role", "authority", "maturity"]) {
      const err = validateRequiredString(role, key, `global semantic_roles[${index}]`);
      if (err) return err;
    }
    for (const key of ["allowed_use", "forbidden_use"]) {
      if (!Array.isArray(role[key]) || (role[key] as unknown[]).length === 0) {
        return `global semantic_roles[${index}] must include non-empty array "${key}"`;
      }
    }
    if (role.applies_to !== undefined && !Array.isArray(role.applies_to)) return `global semantic_roles[${index}].applies_to must be an array when present`;
    if (role.notes !== undefined && typeof role.notes !== "string") return `global semantic_roles[${index}].notes must be a string when present`;
  }

  return null;
}

function validatePackageManifestShape(value: unknown): string | null {
  if (!isObject(value)) return "package manifest must be a JSON object";
  const allowedKeys = new Set([
    "schema_id",
    "package_id",
    "version",
    "global_ref",
    "flow_ref",
    "classification_policy_ref",
    "classification_result_set_ref",
    "classification_result_refs",
    "runtime_binding_set_ref",
    "model_refs",
    "fixture_refs",
    "package_invariants",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return `package manifest contains unsupported field "${key}"`;
  }
  if (value.schema_id !== PACKAGE_MANIFEST_SCHEMA_ID) return `package manifest schema_id must be "${PACKAGE_MANIFEST_SCHEMA_ID}"`;
  for (const key of ["package_id", "version", "flow_ref", "classification_policy_ref", "classification_result_set_ref", "runtime_binding_set_ref"]) {
    const err = validateRequiredString(value, key, "package manifest");
    if (err) return err;
  }
  if (value.global_ref !== undefined && (typeof value.global_ref !== "string" || value.global_ref.trim().length === 0)) {
    return "package manifest global_ref must be a string when present";
  }
  if (!Array.isArray(value.classification_result_refs) || value.classification_result_refs.length === 0) {
    return "package manifest classification_result_refs must be a non-empty array";
  }
  if (value.model_refs !== undefined && !Array.isArray(value.model_refs)) return "package manifest model_refs must be an array when present";
  if (value.fixture_refs !== undefined && !Array.isArray(value.fixture_refs)) return "package manifest fixture_refs must be an array when present";
  if (value.package_invariants !== undefined && !Array.isArray(value.package_invariants)) return "package manifest package_invariants must be an array when present";
  return null;
}

export async function loadInlineContractFlowFromPath(sourcePath: string): Promise<serde_json_like> {
  const raw = await readJsonFromPath(sourcePath);
  if (!isObject(raw)) throw new Error("Local contract file must be a JSON object.");
  const flow = raw as serde_json_like;
  const flowDir = path.dirname(sourcePath);

  if (Array.isArray(flow["steps"])) {
    const steps = flow["steps"] as Record<string, unknown>[];
    for (const step of steps) {
      if (typeof step["output_schema"] === "string") {
        const schema = await resolveOutputSchema(step["output_schema"] as string, flowDir);
        if (schema) {
          step["output_schema_inline"] = schema;
        }
      }
    }
  }

  return flow;
}

async function loadInlineContractFlowFromUrl(url: string): Promise<serde_json_like> {
  const raw = await readJsonFromUrl(url);
  if (!isObject(raw)) throw new Error("Remote contract file must be a JSON object.");
  return raw;
}

async function loadPackageManifestFromSource(filePath: string): Promise<PackageRegistrationSource> {
  const manifestRaw = await readJsonFromPath(filePath);
  const manifestError = validatePackageManifestShape(manifestRaw);
  if (manifestError) throw new Error(manifestError);
  const manifest = manifestRaw as serde_json_like;
  const baseDir = path.dirname(filePath);
  const flowRef = manifest.flow_ref as string;
  const flowPath = resolvePackageRef(flowRef, baseDir);
  const flowJson = await loadInlineContractFlowFromPath(flowPath);
  const globalRef = manifest.global_ref as string | undefined;
  let packageGlobal: serde_json_like | null = null;
  if (globalRef !== undefined) {
    const globalPath = resolvePackageRef(globalRef, baseDir);
    const globalRaw = await readJsonFromPath(globalPath);
    const globalError = validatePackageGlobalShape(globalRaw);
    if (globalError) throw new Error(globalError);
    packageGlobal = globalRaw as serde_json_like;
  }
  return {
    kind: "package_manifest",
    source_path: filePath,
    package_manifest: manifest,
    package_global: packageGlobal,
    flow_json: flowJson,
  };
}

async function loadPackageManifestFromUrl(url: string): Promise<PackageRegistrationSource> {
  const manifestRaw = await readJsonFromUrl(url);
  const manifestError = validatePackageManifestShape(manifestRaw);
  if (manifestError) throw new Error(manifestError);
  const manifest = manifestRaw as serde_json_like;
  const flowJson = await loadInlineContractFlowFromUrl(new URL(manifest.flow_ref as string, url).href);
  const globalRef = manifest.global_ref as string | undefined;
  let packageGlobal: serde_json_like | null = null;
  if (globalRef !== undefined) {
    const globalRaw = await readJsonFromUrl(new URL(globalRef, url).href);
    const globalError = validatePackageGlobalShape(globalRaw);
    if (globalError) throw new Error(globalError);
    packageGlobal = globalRaw as serde_json_like;
  }
  return {
    kind: "package_manifest",
    source_url: url,
    package_manifest: manifest,
    package_global: packageGlobal,
    flow_json: flowJson,
  };
}

async function loadInlineFlowFromPath(sourcePath: string): Promise<PackageRegistrationSource> {
  const flow_json = await loadInlineContractFlowFromPath(sourcePath);
  return { kind: "inline_flow", source_path: sourcePath, flow_json };
}

async function loadInlineFlowFromUrl(url: string): Promise<PackageRegistrationSource> {
  const flow_json = await loadInlineContractFlowFromUrl(url);
  return { kind: "inline_flow", source_url: url, flow_json };
}

export async function loadContractRegistrationSource(sourcePath?: string, sourceUrl?: string): Promise<PackageRegistrationSource> {
  if (sourcePath) {
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (stat?.isDirectory()) {
      return await loadPackageManifestFromSource(path.join(sourcePath, "manifest.json"));
    }

    const parsed = await readJsonFromPath(sourcePath);
    if (isObject(parsed) && parsed.schema_id === PACKAGE_MANIFEST_SCHEMA_ID) {
      return await loadPackageManifestFromSource(sourcePath);
    }
    return await loadInlineFlowFromPath(sourcePath);
  }

  if (sourceUrl) {
    const parsed = await readJsonFromUrl(sourceUrl);
    if (isObject(parsed) && parsed.schema_id === PACKAGE_MANIFEST_SCHEMA_ID) {
      return await loadPackageManifestFromUrl(sourceUrl);
    }
    if (!isObject(parsed)) throw new Error("Remote contract file must be a JSON object.");
    return await loadInlineFlowFromUrl(sourceUrl);
  }

  throw new Error("register requires either source_url or source_path");
}
