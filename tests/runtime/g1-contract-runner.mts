import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname } from "node:path";

import * as AjvModule from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { Client } from "pg";
import { parse } from "yaml";

import { restoreG1Fixture } from "../../packages/database/src/g1-seed.js";
import {
  declaredAssertions,
  validateG1AssertionCoverage,
  type DeclaredAssertion
} from "./g1-assertion-coverage.mts";

type Row = Record<string, unknown>;
type Program = { fixture_id: string; steps: Array<Record<string, unknown>> };
const Ajv2020 = (AjvModule.default ?? AjvModule) as unknown as new (options: Row) => { addSchema: (schema: unknown, id: string) => void; addFormat: (name: string, format: RegExp) => void; compile: (schema: unknown) => ValidateFunction; errorsText: (errors: unknown) => string };

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://fleet_demo:fleet_demo@localhost:5432/fleet_demo";
process.env.DATABASE_URL = databaseUrl;
process.env.CI = "true";
if (process.env.FOTC_DOCKER_BIN) {
  if (!existsSync(process.env.FOTC_DOCKER_BIN)) {
    throw new Error(`FOTC_DOCKER_BIN does not exist: ${process.env.FOTC_DOCKER_BIN}`);
  }
  const dockerDirectory = dirname(process.env.FOTC_DOCKER_BIN);
  if (!process.env.PATH?.split(delimiter).includes(dockerDirectory)) {
    process.env.PATH = `${dockerDirectory}${delimiter}${process.env.PATH ?? ""}`;
  }
}
const apiPort = 3100;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const root = process.cwd();
const catalog = parse(readFileSync(`${root}/tests/spec/demo-r1-test-catalog.yaml`, "utf8"));
const programs = parse(readFileSync(`${root}/tests/spec/demo-r1-test-runner-programs.yaml`, "utf8"));
const resolved = JSON.parse(readFileSync(`${root}/tests/spec/demo-r1-resolved-seeds.json`, "utf8"));
const g1 = JSON.parse(readFileSync(`${root}/tests/spec/seed-layers/g1-foundation.json`, "utf8"));
const tests = new Map(catalog.tests.map((test: Row) => [test.id, test]));
const g1Tests = (g1.required_test_ids as string[]).map((testId) => {
  const test = tests.get(testId) as Row | undefined;
  if (!test) throw new Error(`G1 test ${testId} is missing from the catalog`);
  return test;
});
const declaredAssertionTotal = validateG1AssertionCoverage(g1Tests);
const passed: string[] = [];
const openApi = parse(readFileSync(`${root}/openapi/fleet-operations-control-tower-demo-r1.openapi.yaml`, "utf8")) as Row;
const eventRegistry = parse(readFileSync(`${root}/events/fleet-operations-control-tower-demo-r1.event-registry.yaml`, "utf8")) as Row;
const eventRegistryByType = new Map(((eventRegistry.events as Row[]) ?? []).map((event) => [event.event_type, event]));
const eventSchema = JSON.parse(readFileSync(`${root}/events/fleet-operations-control-tower-demo-r1.events.schema.json`, "utf8")) as Row;
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
openApi.$id = "https://schemas.fotc.local/demo-r1/openapi.yaml";
ajv.addSchema(openApi, String(openApi.$id));
eventSchema.$id = "https://schemas.fotc.local/demo-r1/events.schema.json";
ajv.addSchema(eventSchema, String(eventSchema.$id));
const runId = process.env.G1_RUN_ID ?? `g1-${new Date().toISOString().replaceAll(/[^0-9]/g, "").slice(0, 17)}`;
const evidenceRoot = `${root}/test-results/${runId}`;
mkdirSync(evidenceRoot, { recursive: true });
type Evidence = {
  test_id: string;
  fixture_id: string;
  fixture_state_sha256: string;
  action_type: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: "PASS" | "FAIL";
  correlation_ids: string[];
  generation_id: string | null;
  resolved_non_sensitive_inputs: Row;
  captures: Row;
  assertions: Array<Row>;
  database_diff: Row;
  event_ids: string[];
  assertion_summary: {
    declared: number;
    executed: number;
    missing: string[];
  };
  execution_phases: {
    preparation: Row;
    action: Row;
    rollback: Row;
  };
  error?: string;
};
let activeEvidence: Evidence | null = null;
let activeDeclarations = new Map<string, DeclaredAssertion>();
let executedDeclarations = new Set<string>();

function noteSupportingAssertion(name: string, passedAssertion = true, details: Row = {}): void {
  invariant(passedAssertion, `${String(activeEvidence?.test_id)} assertion failed: ${name}`);
  activeEvidence?.assertions.push({ kind: "SUPPORTING", name, status: "PASS", ...details });
}

function assertDeclared(path: string, actual: unknown, passedAssertion = true, details: Row = {}): void {
  const declaration = activeDeclarations.get(path);
  invariant(declaration, `${String(activeEvidence?.test_id)} executed undeclared assertion ${path}`);
  invariant(!executedDeclarations.has(path), `${String(activeEvidence?.test_id)} executed assertion ${path} more than once`);
  invariant(passedAssertion, `${String(activeEvidence?.test_id)} assertion failed: ${path}; expected=${JSON.stringify(redact(declaration.expected))}; actual=${JSON.stringify(redact(actual))}`);
  executedDeclarations.add(path);
  activeEvidence?.assertions.push({
    kind: "DECLARED",
    declared_path: path,
    executor: declaration.executor,
    expected: redact(declaration.expected),
    actual: redact(actual),
    status: "PASS",
    ...details
  });
}

function assertDeclaredCoverageComplete(): void {
  const missing = [...activeDeclarations.keys()].filter((path) => !executedDeclarations.has(path));
  if (activeEvidence) {
    activeEvidence.assertion_summary.executed = executedDeclarations.size;
    activeEvidence.assertion_summary.missing = missing;
  }
  invariant(missing.length === 0, `${String(activeEvidence?.test_id)} has declared assertions without execution: ${missing.join(", ")}`);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redact(child)]));
  if (typeof value === "string" && value.startsWith("fixture://credentials/")) return "[REDACTED_FIXTURE_CREDENTIAL]";
  return value;
}

function containsSecretMaterial(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();
  if (serialized.includes("fixture://credentials/") || serialized.includes("g1-fake-secret:")) return true;
  return Object.entries(process.env)
    .filter(([name, secretValue]) => name.startsWith("FOTC_TEST_") && Boolean(secretValue))
    .some(([, secretValue]) => serialized.includes(String(secretValue).toLowerCase()));
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function quoteIdentifier(value: string): string {
  invariant(/^[a-z][a-z0-9_]*$/.test(value), `unsafe SQL identifier ${value}`);
  return `"${value}"`;
}

function secret(reference: string): string {
  const name = `FOTC_TEST_${reference.replace("fixture://credentials/", "").replaceAll(".", "_").toUpperCase()}`;
  return process.env[name] ?? `g1-fake-secret:${name}`;
}

function resolveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveValue);
  if (value && typeof value === "object") {
    const record = value as Row;
    if (record.$derive === "SHA256" && typeof record.from === "string") {
      return createHash("sha256").update(secret(record.from)).digest("hex");
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolveValue(item)]));
  }
  return value;
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

const trackedTables = [...g1.table_load_order] as string[];

async function snapshotDatabase(): Promise<Row> {
  return withClient(async (client) => {
    const primaryKeyRows = (await client.query<{ table_name: string; column_name: string }>(`
      SELECT tc.table_name,kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema=tc.constraint_schema AND kcu.constraint_name=tc.constraint_name
       WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY' AND tc.table_name=ANY($1::text[])
       ORDER BY tc.table_name,kcu.ordinal_position
    `, [trackedTables])).rows;
    const primaryKeys = new Map<string, string[]>();
    for (const row of primaryKeyRows) {
      const columns = primaryKeys.get(row.table_name) ?? [];
      columns.push(row.column_name);
      primaryKeys.set(row.table_name, columns);
    }
    const snapshot: Row = {};
    for (const table of trackedTables) {
      const rows = (await client.query<{ row: Row }>(`SELECT to_jsonb(t) AS row FROM ${quoteIdentifier(table)} t ORDER BY to_jsonb(t)::text`)).rows.map((item) => item.row);
      snapshot[table] = { key_columns: primaryKeys.get(table) ?? [], rows };
    }
    return snapshot;
  });
}

function redactDatabaseRow(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [
    column,
    /(token|secret|password|csrf|signature|payload|metadata|body)/i.test(column) ? "[REDACTED_SENSITIVE_FIELD]" : redact(value)
  ]));
}

function databaseRowKey(row: Row, keyColumns: string[]): Row {
  if (keyColumns.length > 0) return Object.fromEntries(keyColumns.map((column) => [column, row[column]]));
  return { row_sha256: createHash("sha256").update(JSON.stringify(canonicalValue(row))).digest("hex") };
}

function changedTables(before: Row, after: Row): Row {
  const changed: Row = {};
  for (const table of trackedTables) {
    const beforeTable = (before[table] as { key_columns?: string[]; rows?: Row[] } | undefined) ?? {};
    const afterTable = (after[table] as { key_columns?: string[]; rows?: Row[] } | undefined) ?? {};
    const keyColumns = beforeTable.key_columns ?? afterTable.key_columns ?? [];
    const keyed = (rows: Row[]) => new Map(rows.map((row) => [JSON.stringify(databaseRowKey(row, keyColumns)), row]));
    const beforeRows = keyed(beforeTable.rows ?? []);
    const afterRows = keyed(afterTable.rows ?? []);
    const inserted: Row[] = [];
    const deleted: Row[] = [];
    const updated: Row[] = [];
    for (const [key, row] of afterRows) {
      const previous = beforeRows.get(key);
      if (!previous) inserted.push({ key: databaseRowKey(row, keyColumns), row: redactDatabaseRow(row) });
      else if (JSON.stringify(canonicalValue(previous)) !== JSON.stringify(canonicalValue(row))) {
        updated.push({ key: databaseRowKey(row, keyColumns), before: redactDatabaseRow(previous), after: redactDatabaseRow(row) });
      }
    }
    for (const [key, row] of beforeRows) {
      if (!afterRows.has(key)) deleted.push({ key: databaseRowKey(row, keyColumns), row: redactDatabaseRow(row) });
    }
    if (inserted.length > 0 || deleted.length > 0 || updated.length > 0) {
      changed[table] = { key_columns: keyColumns, inserted, deleted, updated };
    }
  }
  return changed;
}

function fixtureGeneration(fixtureId: string): string | null {
  const tables = (resolved.fixtures[fixtureId]?.tables ?? {}) as Record<string, Row[]>;
  const runtime = tables.demo_runtime_control?.[0];
  if (typeof runtime?.active_generation_id === "string") return runtime.active_generation_id;
  const active = tables.demo_generation?.find((row) => row.status === "ACTIVE");
  return typeof active?.id === "string" ? active.id : null;
}

function evidenceInputs(test: Row): Row {
  const action = (test.action as Row | undefined) ?? {};
  return {
    method: action.method ?? null,
    resolved_path: action.resolved_path ?? null,
    headers: redact(action.headers ?? {}),
    body: redact(action.body ?? null),
    invocations: redact(action.invocations ?? null),
    program_id: action.program_id ?? null
  };
}

function writeEvidence(evidence: Evidence): void {
  invariant(!containsSecretMaterial(evidence), `${evidence.test_id} evidence contains secret material`);
  const directory = `${evidenceRoot}/${evidence.test_id}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function run(testId: string, work: () => Promise<unknown>): Promise<void> {
  const test = tests.get(testId) as Row;
  const fixtureId = String(test.fixture);
  const action = (test.action as Row | undefined) ?? {};
  const preparationStartedAt = new Date().toISOString();
  if (testId !== "TST-DEMO-ENV-001") await restoreG1Fixture({ fixtureId });
  const preparationCompletedAt = new Date().toISOString();
  const before = testId === "TST-DEMO-ENV-001" ? {} : await snapshotDatabase();
  const declarations = declaredAssertions(test);
  activeDeclarations = new Map(declarations.map((declaration) => [declaration.path, declaration]));
  executedDeclarations = new Set<string>();
  const started = Date.now();
  const evidence: Evidence = {
    test_id: testId,
    fixture_id: fixtureId,
    fixture_state_sha256: String(resolved.fixtures[fixtureId]?.state_sha256 ?? ""),
    action_type: String(action.type ?? "UNKNOWN"),
    started_at: new Date(started).toISOString(),
    completed_at: "",
    duration_ms: 0,
    status: "FAIL",
    correlation_ids: typeof (action.headers as Row | undefined)?.["X-Correlation-ID"] === "string" ? [String((action.headers as Row)["X-Correlation-ID"])] : [],
    generation_id: fixtureGeneration(fixtureId),
    resolved_non_sensitive_inputs: evidenceInputs(test),
    captures: {},
    assertions: [],
    database_diff: {},
    event_ids: [],
    assertion_summary: {
      declared: declarations.length,
      executed: 0,
      missing: declarations.map((declaration) => declaration.path)
    },
    execution_phases: {
      preparation: {
        started_at: preparationStartedAt,
        completed_at: preparationCompletedAt,
        fixture_id: fixtureId,
        completed_before_initial_snapshot: testId !== "TST-DEMO-ENV-001",
        attributed_to_contract_diff: false
      },
      action: { started_at: new Date(started).toISOString() },
      rollback: {}
    }
  };
  activeEvidence = evidence;
  try {
    await work();
    assertDeclaredCoverageComplete();
    evidence.status = "PASS";
    passed.push(testId);
    process.stdout.write(`${JSON.stringify({ test_id: testId, status: "PASS" })}\n`);
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const after = testId === "TST-DEMO-ENV-001" ? {} : await snapshotDatabase();
    const actionChanges = testId === "TST-DEMO-ENV-001" ? {} : changedTables(before, after);
    const rollbackExpected = Array.isArray((test.expected as Row).no_state_changes);
    evidence.database_diff = {
      preparation: {
        fixture_id: fixtureId,
        completed_before_initial_snapshot: testId !== "TST-DEMO-ENV-001",
        excluded_from_contract_effects: true
      },
      action: {
        tracked_tables: testId === "TST-DEMO-ENV-001" ? [] : trackedTables,
        changed_tables: actionChanges
      },
      rollback: {
        expected: rollbackExpected,
        verified: rollbackExpected ? Object.keys(actionChanges).length === 0 : null
      }
    };
    evidence.execution_phases.rollback = (evidence.database_diff as Row).rollback as Row;
    evidence.completed_at = new Date().toISOString();
    evidence.duration_ms = Date.now() - started;
    evidence.execution_phases.action.completed_at = evidence.completed_at;
    writeEvidence(evidence);
    activeEvidence = null;
    activeDeclarations = new Map();
    executedDeclarations = new Set();
  }
}

function runCli(argv: string[], timeout = 120_000): string {
  const pnpmEntrypoint = process.env.npm_execpath;
  const executable = process.platform === "win32" && argv[0] === "pnpm" ? process.execPath : argv[0];
  const args = process.platform === "win32" && argv[0] === "pnpm"
    ? [String(pnpmEntrypoint), ...argv.slice(1)]
    : argv.slice(1);
  invariant(argv[0] !== "pnpm" || process.platform !== "win32" || Boolean(pnpmEntrypoint), "npm_execpath is required to invoke pnpm without a shell on Windows");
  const result = spawnSync(executable, args, { cwd: root, env: process.env, timeout, encoding: "utf8", shell: false });
  invariant(result.status === 0, `${argv.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

async function executeCliTest(testId: string, invocationIndexes?: number[]): Promise<void> {
  const test = tests.get(testId) as Row;
  const action = test.action as Row;
  const invocations = (action.invocations as Array<Row>) ?? [];
  const selected = invocationIndexes ? invocationIndexes.map((index) => invocations[index]).filter(Boolean) : invocations;
  for (const invocation of selected) {
    const argv = invocation.argv as string[];
    const output = runCli(argv, Number(invocation.timeout_ms ?? 120_000));
    noteSupportingAssertion(`CLI ${argv.join(" ")} exited with an allowed code`);
    invariant(!output.includes("FOTC_TEST_") && !output.includes("g1-fake-secret:"), `${testId} emitted a credential in CLI output`);
  }
  if (testId === "TST-DEMO-ENV-001") {
    await withClient(async (client) => { await client.query("SELECT 1"); });
    const [live, ready] = await Promise.all([
      fetch("http://127.0.0.1:3000/health/live"),
      fetch("http://127.0.0.1:3000/health/ready")
    ]);
    const runningServices = runCli(["docker", "compose", "ps", "--services", "--filter", "status=running"], 30_000)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const requiredServices = ["web", "api", "worker", "postgres", "mailpit"];
    assertDeclared("expected.states.services", runningServices, requiredServices.every((service) => runningServices.includes(service)));
    await executeDataScan("expected.security_assertions[0]");
    assertDeclared("expected.response_assertions.health_live", live.status, live.status === 200);
    assertDeclared("expected.response_assertions.health_ready", ready.status, ready.status === 200);
  }
}

async function databaseDemoDataSafety(): Promise<{ emails: string[]; phones: string[]; plates: string[] }> {
  return withClient(async (client) => {
    const emails = (await client.query<{ value: string }>(`
      SELECT email AS value FROM app_user
      UNION ALL SELECT email AS value FROM supplier
    `)).rows.map((row) => row.value);
    const phones = (await client.query<{ value: string }>(`
      SELECT phone AS value FROM supplier
      UNION ALL SELECT phone AS value FROM driver
    `)).rows.map((row) => row.value);
    const plates = (await client.query<{ value: string }>("SELECT plate AS value FROM vehicle_registration")).rows.map((row) => row.value);
    return { emails, phones, plates };
  });
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalValue(child)]));
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return new Date(value).toISOString();
  }
  return value;
}

function canonicalRows(rows: Row[]): string[] {
  return rows.map((row) => JSON.stringify(canonicalValue(row))).sort();
}

function remapFixtureRow(row: Row, targetGenerationId: string): Row {
  return Object.fromEntries(Object.entries(resolveValue(row) as Row).map(([key, value]) => [
    key,
    key === "demo_generation_id" || key === "active_generation_id" ? targetGenerationId : value
  ]));
}

async function compareReseedToManifest(targetGenerationId: string): Promise<Row> {
  const excludedControlEffects = new Set([
    "demo_generation",
    "demo_reset_execution",
    "demo_runtime_control",
    "domain_event",
    "idempotency_record",
    "integration_outbox",
    "security_audit_record"
  ]);
  const expectedTables = resolved.fixtures["FX-SEED-V213"].tables as Record<string, Row[]>;
  return withClient(async (client) => {
    const compared: Row = {};
    const mismatches: string[] = [];
    for (const table of g1.table_load_order as string[]) {
      if (excludedControlEffects.has(table)) continue;
      const actual = (await client.query<{ row: Row }>(`SELECT to_jsonb(t) AS row FROM ${quoteIdentifier(table)} t`)).rows.map((item) => item.row);
      const expected = (expectedTables[table] ?? []).map((row) => remapFixtureRow(row, targetGenerationId));
      const matches = JSON.stringify(canonicalRows(actual)) === JSON.stringify(canonicalRows(expected));
      compared[table] = { expected_rows: expected.length, actual_rows: actual.length, matches };
      if (!matches) mismatches.push(table);
    }
    return { compared_tables: compared, mismatches };
  });
}

async function resetQueueState(sourceGenerationId: string): Promise<Row> {
  const candidates = ["integration_outbox", "consumer_receipt", "integration_inbox", "background_job", "worker_lease"];
  return withClient(async (client) => {
    const tables: Row = {};
    for (const table of candidates) {
      const exists = Boolean((await client.query<{ relation: string | null }>("SELECT to_regclass($1) AS relation", [`public.${table}`])).rows[0]?.relation);
      if (!exists) {
        tables[table] = { status: "NOT_IN_G1_SCHEMA" };
        continue;
      }
      const hasGeneration = (await client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='demo_generation_id'",
        [table]
      )).rowCount === 1;
      const sourceRows = hasGeneration
        ? Number((await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${quoteIdentifier(table)} WHERE demo_generation_id=$1`, [sourceGenerationId])).rows[0].count)
        : 0;
      tables[table] = { status: "PRESENT", source_generation_rows: sourceRows };
    }
    return tables;
  });
}

async function waitForApi(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`G1 API exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${apiUrl}/health/live`);
      if (response.status === 200) return;
    } catch {
      // The API may still be starting; retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("G1 API did not become ready on port 3100");
}

function requestHeaders(action: Row): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, raw] of Object.entries((action.headers as Row | undefined) ?? {})) {
    if (typeof raw !== "string") continue;
    if (raw.startsWith("fixture://credentials/")) {
      headers[name] = name.toLowerCase() === "cookie"
        ? `fotc_demo_session=${secret(raw)}`
        : secret(raw);
    } else {
      headers[name] = raw;
    }
  }
  if (action.body !== null && action.body !== undefined) headers["content-type"] = "application/json";
  return headers;
}

function operationFor(action: Row): Row {
  const paths = openApi.paths as Row;
  const resolvedPath = String(action.resolved_path);
  const exactPath = paths?.[resolvedPath] as Row | undefined;
  const templatePath = exactPath ? resolvedPath : Object.keys(paths ?? {}).find((candidate) => {
    const pattern = `^${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(/\\\{[^}]+\\\}/g, "[^/]+")}$`;
    return new RegExp(pattern).test(resolvedPath);
  });
  const path = (exactPath ?? (templatePath ? paths[templatePath] : undefined)) as Row | undefined;
  const operation = path?.[String(action.method).toLowerCase()] as Row | undefined;
  invariant(operation, `OpenAPI operation is missing for ${String(action.method)} ${String(action.resolved_path)}`);
  return operation;
}

function compileSchema(schema: Row): ValidateFunction {
  if (typeof schema.$ref === "string") {
    return ajv.compile({ $ref: `${String(openApi.$id)}${String(schema.$ref)}` });
  }
  return ajv.compile(schema);
}

function assertHttpContract(testId: string, test: Row, action: Row, response: Response, body: Row | null, rawBody: string): void {
  const operation = operationFor(action);
  const expected = test.expected as Row;
  const operationId = String(operation.operationId ?? "");
  assertDeclared("action.operation_id", operationId, operationId === action.operation_id);
  const responseAssertions = (expected.response_assertions as Row | undefined) ?? {};
  if (responseAssertions.conforms_to_openapi_operation !== undefined) {
    assertDeclared(
      "expected.response_assertions.conforms_to_openapi_operation",
      operationId,
      operationId === responseAssertions.conforms_to_openapi_operation
    );
  }
  const requestBody = action.body === null || action.body === undefined ? undefined : resolveValue(action.body);
  const requestSchema = ((operation.requestBody as Row | undefined)?.content as Row | undefined)?.["application/json"] as Row | undefined;
  let requestSchemaRejected = false;
  if (requestSchema?.schema) {
    const requestValidator = compileSchema(requestSchema.schema as Row);
    const requestValid = requestValidator(requestBody);
    if (expected.error_code === "INVALID_REQUEST") {
      invariant(!requestValid, `${testId} expected the request schema to reject the negative input`);
      requestSchemaRejected = !requestValid;
      noteSupportingAssertion("request schema rejects the normative negative input");
    } else {
      invariant(requestValid, `${testId} request violates its OpenAPI schema: ${ajv.errorsText(requestValidator.errors)}`);
noteSupportingAssertion("request conforms to the OpenAPI schema");
    }
  }
  const responseDefinition = (operation.responses as Row | undefined)?.[String(response.status)] as Row | undefined;
  const responseContent = (responseDefinition?.content as Row | undefined)?.["application/json"] as Row | undefined;
  const responseSchema = responseContent?.schema as Row | undefined;
  const actualResponseSchemaRef = typeof responseSchema?.$ref === "string" ? responseSchema.$ref : null;
  if (Object.hasOwn(responseAssertions, "response_schema_ref")) {
    assertDeclared(
      "expected.response_assertions.response_schema_ref",
      actualResponseSchemaRef,
      actualResponseSchemaRef === responseAssertions.response_schema_ref
    );
  }
  let responseSchemaValid = response.status === 204 && !responseSchema;
  if (responseSchema && response.status !== 204) {
    const responseValidator = compileSchema(responseSchema);
    responseSchemaValid = Boolean(responseValidator(body));
    invariant(responseSchemaValid, `${testId} response violates OpenAPI: ${ajv.errorsText(responseValidator.errors)}; body=${rawBody}`);
    noteSupportingAssertion("response conforms to the OpenAPI schema");
  }
  if (Object.hasOwn(responseAssertions, "contains_x_correlation_id")) {
    const actual = response.headers.get("x-correlation-id");
    const expectedCorrelation = (action.headers as Row | undefined)?.["X-Correlation-ID"];
    const valid = responseAssertions.contains_x_correlation_id
      ? Boolean(actual) && (!expectedCorrelation || actual === expectedCorrelation)
      : !actual;
    assertDeclared("expected.response_assertions.contains_x_correlation_id", Boolean(actual), valid);
    if (actual && !activeEvidence?.correlation_ids.includes(actual)) activeEvidence?.correlation_ids.push(actual);
  }
  if (Object.hasOwn(responseAssertions, "contains_x_demo_generation_id")) {
    const generationId = response.headers.get("x-demo-generation-id");
    const valid = responseAssertions.contains_x_demo_generation_id ? Boolean(generationId) : !generationId;
    assertDeclared("expected.response_assertions.contains_x_demo_generation_id", Boolean(generationId), valid);
    if (generationId) activeEvidence!.generation_id = generationId;
  }
  const serialized = rawBody.toLowerCase();
  const credentialValues = ((action.credential_refs as string[] | undefined) ?? []).map(secret);
  const containsCredential = serialized.includes("fixture://credentials/")
    || serialized.includes("g1-fake-secret:")
    || credentialValues.some((credential) => credential.length > 0 && serialized.includes(credential.toLowerCase()));
  for (const [index, assertion] of ((expected.security_assertions as string[] | undefined) ?? []).entries()) {
    if (assertion.includes("nenhum campo fora")) {
      assertDeclared(`expected.security_assertions[${index}]`, responseSchemaValid, responseSchemaValid);
    } else if (assertion.includes("nenhuma credencial")) {
      assertDeclared(`expected.security_assertions[${index}]`, containsCredential ? "credential_detected" : "no_credentials", !containsCredential);
    } else if (assertion.includes("claims não são derivados")) {
      assertDeclared(`expected.security_assertions[${index}]`, requestSchemaRejected ? "request_schema_rejected" : "request_schema_accepted", requestSchemaRejected);
    }
  }
  if (expected.error_code) {
    const actualErrorCode = (body?.error as Row | undefined)?.code;
    assertDeclared("expected.error_code", actualErrorCode, actualErrorCode === expected.error_code);
  }
}

async function assertExpectedEvents(testId: string, test: Row, action: Row): Promise<void> {
  const expected = test.expected as Row;
  const expectedTypes = (expected.events as string[] | undefined) ?? [];
  if (expectedTypes.length === 0) return;
  const correlationId = String((action.headers as Row)["X-Correlation-ID"]);
  const rows = await withClient(async (client) => (await client.query<Row>(`SELECT * FROM domain_event WHERE correlation_id=$1 ORDER BY aggregate_sequence`, [correlationId])).rows);
  for (const [eventIndex, eventType] of expectedTypes.entries()) {
    const row = rows.find((candidate) => candidate.event_type === eventType);
    invariant(row, `${testId} did not produce event ${eventType}`);
    const registryEntry = eventRegistryByType.get(eventType) as Row | undefined;
    invariant(registryEntry, `${testId} event ${eventType} is absent from the event registry`);
    const event = {
      event_id: row.id,
      demo_generation_id: row.demo_generation_id,
      event_type: row.event_type,
      schema_version: row.schema_version,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      aggregate_version: row.aggregate_version,
      aggregate_sequence: row.aggregate_sequence,
      occurred_at: new Date(row.occurred_at as string).toISOString(),
      recorded_at: new Date(row.recorded_at as string).toISOString(),
      source_type: row.source_type,
      source_id: row.source_id,
      correlation_id: row.correlation_id,
      causation_id: row.causation_id,
      idempotency_record_id: row.idempotency_record_id,
      data_classification: row.data_classification,
      demo_seed_version: row.demo_seed_version,
      demo_mode: row.demo_mode,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
    };
    const validator = ajv.compile({ $ref: `${String(eventSchema.$id)}#/$defs/${eventType}Event` });
    const schemaValid = Boolean(validator(event));
    invariant(schemaValid, `${testId} event ${eventType} violates event schema: ${ajv.errorsText(validator.errors)}`);
    const resetExecution = eventType === "DemoResetRequested"
      ? await withClient(async (client) => (await client.query<Row>(
        "SELECT source_generation_id,target_generation_id,requested_by_identity_code FROM demo_reset_execution WHERE id=$1",
        [row.aggregate_id]
      )).rows[0])
      : null;
    const eventFacetsValid = schemaValid
      && row.aggregate_type === registryEntry.aggregate_type
      && row.data_classification === registryEntry.data_classification
      && row.schema_version === registryEntry.schema_version
      && row.aggregate_sequence === row.aggregate_version
      && (eventType !== "DemoResetRequested" || (
        row.source_type === "DEMO_ADMIN_USER"
        && typeof row.source_id === "string"
        && (event.payload as Row).source_generation_id === resetExecution?.source_generation_id
        && (event.payload as Row).target_generation_id === resetExecution?.target_generation_id
        && (event.payload as Row).requested_by_identity_code === resetExecution?.requested_by_identity_code
      ));
    assertDeclared(`expected.events[${eventIndex}]`, {
      event_type: row.event_type,
      schema_valid: schemaValid,
      payload_valid: schemaValid,
      aggregate_type: row.aggregate_type,
      aggregate_sequence: row.aggregate_sequence,
      source_type: row.source_type,
      source_id_present: typeof row.source_id === "string",
      data_classification: row.data_classification
    }, eventFacetsValid);
    activeEvidence?.event_ids.push(String(row.id));
    const eventAssertions = (expected.event_assertions as Row | undefined) ?? {};
    if (eventAssertions.schema_version !== undefined) {
      assertDeclared("expected.event_assertions.schema_version", row.schema_version, row.schema_version === eventAssertions.schema_version);
    }
    if (eventAssertions.demo_generation_id !== undefined) {
      const generationMatches = row.demo_generation_id === eventAssertions.demo_generation_id
        && row.demo_generation_id === (event.payload as Row).source_generation_id;
      assertDeclared(
        "expected.event_assertions.demo_generation_id",
        row.demo_generation_id,
        generationMatches,
        { production_guard: "domain_event insert is conditional on the active runtime generation in the producing transaction" }
      );
    }
    if (eventAssertions.aggregate_sequence_equals_resulting_version) {
      assertDeclared(
        "expected.event_assertions.aggregate_sequence_equals_resulting_version",
        row.aggregate_sequence === row.aggregate_version,
        row.aggregate_sequence === row.aggregate_version
      );
    }
  }
}

async function executeHttp(testId: string): Promise<{ response: Response; body: Row | null }> {
  const test = tests.get(testId) as Row;
  const action = test.action as Row;
  let readinessWorker: ChildProcess | undefined;
  try {
    if (testId === "TST-API-GET-READINESS-001") {
      readinessWorker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: databaseUrl, DEMO_MODE: "true", WORKER_INSTANCE_ID: "g1-readiness-contract" },
        stdio: "ignore"
      });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const liveLease = await withClient(async (client) => (await client.query<{ live: boolean }>(`
          SELECT (expires_at > now()) AS live
            FROM worker_lease
           WHERE lease_code='g1-reset-watchdog'
        `)).rows[0]?.live);
        if (liveLease) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    const response = await fetch(`${apiUrl}${String(action.resolved_path)}`, {
      method: String(action.method),
      headers: requestHeaders(action),
      body: action.body === null || action.body === undefined ? undefined : JSON.stringify(resolveValue(action.body))
    });
    const rawBody = await response.text();
    const body = rawBody ? JSON.parse(rawBody) as Row : null;
    const expected = test.expected as Row;
    assertDeclared("expected.http_status", response.status, response.status === expected.http_status, { response_body_redacted: redact(body) });
    assertHttpContract(testId, test, action, response, body, rawBody);
    await assertExpectedEvents(testId, test, action);
    return { response, body };
  } finally {
    readinessWorker?.kill();
  }
}

function seedRow(reference: string): Row {
  const match = /^seed:\/\/([^/]+)\/tables\/([^/]+)\/(\d+)$/.exec(reference);
  invariant(match, `invalid seed reference ${reference}`);
  const [, fixtureId, table, index] = match;
  const row = resolved.fixtures[fixtureId].tables[table][Number(index)];
  invariant(row, `seed reference not found ${reference}`);
  return structuredClone(row);
}

function mutate(row: Row, mutations: Array<Row>): Row {
  for (const mutation of mutations) {
    const path = String(mutation.path);
    invariant(/^\/[a-z][a-z0-9_]*$/.test(path), `unsupported mutation path ${path}`);
    row[path.slice(1)] = mutation.value;
  }
  return row;
}

async function expectedDatabaseRejection(testId: string, program: Program): Promise<void> {
  const step = program.steps[0];
  const source = seedRow(String((step.source as Row).ref));
  const row = mutate(source, (step.mutations as Array<Row>) ?? []);
  const table = String(step.target_table);
  const expectation = step.expect as Row;
  await withClient(async (client) => {
    const before = (await client.query<Row>(`SELECT to_jsonb(t) AS row FROM ${quoteIdentifier(table)} t ORDER BY to_jsonb(t)::text`)).rows;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    let postgresError: { code?: string; constraint?: string };
    try {
      if (step.op === "CLONE_INSERT") {
        const columns = Object.keys(row);
        await client.query(
          `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
          columns.map((column) => resolveValue(row[column]))
        );
      } else if (step.op === "PATCH_UPDATE") {
        const mutations = step.mutations as Array<Row>;
        await client.query(
          `UPDATE ${quoteIdentifier(table)} SET ${mutations.map((mutation, index) => `${quoteIdentifier(String(mutation.path).slice(1))}=$${index + 1}`).join(", ")} WHERE "id"=$${mutations.length + 1}`,
          [...mutations.map((mutation) => resolveValue(mutation.value)), source.id]
        );
      } else {
        throw new Error(`unsupported rejecting DB op ${String(step.op)}`);
      }
      throw new Error(`${program.fixture_id} program unexpectedly succeeded`);
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      invariant(pgError.code === expectation.error_code, `expected SQLSTATE ${expectation.error_code}; got ${pgError.code}`);
      invariant(pgError.constraint === expectation.constraint, `expected constraint ${expectation.constraint}; got ${pgError.constraint}`);
      postgresError = pgError;
    } finally {
      await client.query("ROLLBACK");
    }
    const after = (await client.query<Row>(`SELECT to_jsonb(t) AS row FROM ${quoteIdentifier(table)} t ORDER BY to_jsonb(t)::text`)).rows;
    assertDeclared("expected.error_code", "DATA_CONSTRAINT_VIOLATION", Boolean(postgresError));
    assertDeclared("expected.database_assertions[0]", postgresError?.constraint, postgresError?.constraint === expectation.constraint, {
      test_id: testId,
      postgres_error_code: postgresError?.code
    });
    assertDeclared("expected.no_state_changes[0]", JSON.stringify(before) === JSON.stringify(after) ? "transaction rolled back" : "table changed", JSON.stringify(before) === JSON.stringify(after), {
      table,
      before_rows: before.length,
      after_rows: after.length
    });
  });
}

async function executeDatabaseProgram(testId: string): Promise<void> {
  const program = programs.database_programs[testId] as Program;
  if (["TST-DATA-IAM-001", "TST-DATA-IAM-002", "TST-DATA-IAM-003", "TST-DATA-IAM-004", "TST-DATA-RESET-001"].includes(testId)) {
    await expectedDatabaseRejection(testId, program);
    return;
  }
  if (testId === "TST-DATA-IAM-005") {
    const count = await withClient(async (client) => (await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
        FROM app_user u
        LEFT JOIN user_customer_scope c ON c.user_id=u.id
        LEFT JOIN user_operating_unit_scope o ON o.user_id=u.id
        LEFT JOIN team_member t ON t.user_id=u.id AND t.is_active
       WHERE u.identity_code='demo.admin' AND (c.user_id IS NOT NULL OR o.user_id IS NOT NULL OR t.user_id IS NOT NULL)
    `)).rows[0].count);
    invariant(count === "0", "Demo Admin has operational grants");
    assertDeclared("expected.database_assertions[0]", Number(count), count === "0");
    return;
  }
  if (testId === "TST-DATA-RESET-002") {
    const worker = spawn(process.execPath, ["apps/worker/dist/main.js"], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, DEMO_MODE: "true", WORKER_INSTANCE_ID: "g1-contract-runner" }, stdio: "ignore" });
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const status = await withClient(async (client) => (await client.query<{ status: string; failure_code: string | null; recovery_attempt_count: number; source_generation_id: string; target_generation_id: string }>(`SELECT status,failure_code,recovery_attempt_count,source_generation_id,target_generation_id FROM demo_reset_execution WHERE id='0f18c55b-46d4-59a3-94d9-ea2b8517d7cc'`)).rows[0]);
        if (status?.status === "FAILED") {
          invariant(status.failure_code === "RESET_OWNER_LOST_RECOVERED_TO_SOURCE", "watchdog used unexpected failure code");
          invariant(status.recovery_attempt_count === 1, "watchdog recovery attempt count is not 1");
          const state = await withClient(async (client) => (await client.query<{ runtime_status: string; active_generation_id: string; source_status: string; target_status: string; audit_codes: string[] }>(`
            SELECT r.runtime_status,r.active_generation_id,
                   source.status AS source_status,target.status AS target_status,
                   (SELECT array_agg(action_code ORDER BY action_code) FROM security_audit_record WHERE action_code IN ('DEMO_RESET_HEARTBEAT_EXPIRED','DEMO_RESET_RECOVERY_STARTED','DEMO_RESET_RECOVERED_TO_SOURCE')) AS audit_codes
              FROM demo_runtime_control r
              JOIN demo_generation source ON source.id=$1
              JOIN demo_generation target ON target.id=$2
             WHERE r.singleton_key=TRUE
          `, [status.source_generation_id, status.target_generation_id])).rows[0]);
          invariant(state.runtime_status === "ACTIVE", "runtime did not return ACTIVE after recovery");
          invariant(state.active_generation_id === status.source_generation_id, "source generation was not reactivated");
          invariant(state.source_status === "ACTIVE" && state.target_status === "FAILED", "generation recovery statuses are incorrect");
          const auditCodes = state.audit_codes ?? [];
          const requiredAuditCodes = ["DEMO_RESET_HEARTBEAT_EXPIRED", "DEMO_RESET_RECOVERY_STARTED", "DEMO_RESET_RECOVERED_TO_SOURCE"];
          invariant(requiredAuditCodes.every((code) => auditCodes.includes(code)), "watchdog recovery audit records are incomplete");
          assertDeclared("expected.database_assertions[0]", { source_status: state.source_status, target_status: state.target_status }, state.source_status === "ACTIVE" && state.target_status === "FAILED");
          assertDeclared("expected.database_assertions[1]", state.source_status, state.source_status === "ACTIVE");
          assertDeclared("expected.database_assertions[2]", state.target_status, state.target_status === "FAILED");
          assertDeclared("expected.database_assertions[3]", state.runtime_status, state.runtime_status === "ACTIVE");
          assertDeclared("expected.database_assertions[4]", status.status, status.status === "FAILED");
          assertDeclared("expected.database_assertions[5]", status.failure_code, status.failure_code === "RESET_OWNER_LOST_RECOVERED_TO_SOURCE");
          assertDeclared("expected.database_assertions[6]", status.recovery_attempt_count, status.recovery_attempt_count === 1);
          for (const [index, code] of requiredAuditCodes.entries()) {
            assertDeclared(`expected.audit_assertions[${index}]`, code, auditCodes.includes(code), { observed_action_codes: auditCodes });
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("watchdog did not recover the expired reset");
    } finally {
      worker.kill();
    }
  }
  if (testId === "TST-DATA-RESET-003") {
    const auditId = String(resolved.fixtures[program.fixture_id].tables.security_audit_record[0].id);
    await restoreG1Fixture({ fixtureId: "FX-SEED-V213", preserveTables: ["demo_generation", "demo_reset_execution", "security_audit_record"] });
    const preserved = await withClient(async (client) => (await client.query(`SELECT 1 FROM security_audit_record WHERE id=$1`, [auditId])).rowCount);
    invariant(preserved === 1, "audit record was not preserved by reset");
    assertDeclared("expected.database_assertions[0]", preserved, preserved === 1);
    return;
  }
  throw new Error(`unimplemented G1 database program ${testId}`);
}

async function executeScenarioReset005(): Promise<void> {
  await restoreG1Fixture({ fixtureId: "FX-API-RESET", preserveTables: ["demo_reset_execution"] });
  const snapshot = await withClient(async (client) => (await client.query<{ requested_by_user_id_snapshot: string | null; requested_by_identity_code: string }>(`SELECT requested_by_user_id_snapshot,requested_by_identity_code FROM demo_reset_execution WHERE id='2a5e717a-d5e0-5dda-bf7a-b9f57b64f065'`)).rows[0]);
  invariant(Boolean(snapshot.requested_by_user_id_snapshot), "reset user snapshot was lost");
  invariant(snapshot.requested_by_identity_code === "demo.admin", "reset identity snapshot changed");
  assertDeclared("expected.database_assertions[0]", "reseed completed without FK failure", true);
  assertDeclared("expected.database_assertions[1]", {
    requested_by_user_id_snapshot: snapshot.requested_by_user_id_snapshot,
    requested_by_identity_code: snapshot.requested_by_identity_code
  }, Boolean(snapshot.requested_by_user_id_snapshot) && snapshot.requested_by_identity_code === "demo.admin");
}

async function executeDataScan(assertionPath = "expected.security_assertions[0]"): Promise<void> {
  const checked = { emails: 0, phones: 0, plates: 0 };
  for (const fixture of Object.values(resolved.fixtures) as Array<{ tables: Record<string, Row[]> }>) {
    for (const rows of Object.values(fixture.tables)) {
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          if (column === "email") {
            checked.emails += 1;
            invariant(String(value).endsWith(".invalid"), `non-demo email ${value}`);
          }
          if (column === "phone" || column === "contact_phone") {
            checked.phones += 1;
            invariant(String(value).startsWith("+55000000"), `non-demo phone ${value}`);
          }
          if (column === "plate") {
            checked.plates += 1;
            invariant(String(value).startsWith("DEM"), `non-demo plate ${value}`);
          }
        }
      }
    }
  }
  assertDeclared(assertionPath, { violations: 0, checked }, true);
}

await run("TST-DEMO-ENV-001", async () => {
  await executeCliTest("TST-DEMO-ENV-001");
});
await run("TST-DEMO-SEED-001", async () => {
  await executeCliTest("TST-DEMO-SEED-001", [0]);
  const first = await withClient(async (client) => (await client.query(`SELECT id,identity_code FROM app_user ORDER BY identity_code`)).rows);
  await executeCliTest("TST-DEMO-SEED-001", [1]);
  const second = await withClient(async (client) => (await client.query(`SELECT id,identity_code FROM app_user ORDER BY identity_code`)).rows);
  assertDeclared("expected.database_assertions[0]", { first, second }, JSON.stringify(first) === JSON.stringify(second));
  const test = tests.get("TST-DEMO-SEED-001") as Row;
  const manifest = await withClient(async (client) => (await client.query<{ manifest_sha256: string; seed_version: string }>(`SELECT seed_version,manifest_sha256 FROM demo_seed_manifest WHERE is_active=TRUE`)).rows[0]);
  const expectedManifest = (resolved.fixtures[String(test.fixture)].tables.demo_seed_manifest as Row[])[0];
  const manifestMatches = manifest?.seed_version === expectedManifest.seed_version
    && manifest?.manifest_sha256 === expectedManifest.manifest_sha256
    && /^[0-9a-f]{64}$/.test(manifest.manifest_sha256);
  assertDeclared("expected.database_assertions[1]", manifest, manifestMatches);
  const safety = await databaseDemoDataSafety();
  const emailsAreInvalid = safety.emails.every((email) => email.endsWith(".invalid"));
  assertDeclared("expected.database_assertions[2]", { checked: safety.emails.length, violations: safety.emails.filter((email) => !email.endsWith(".invalid")) }, emailsAreInvalid);
  const noRealData = emailsAreInvalid
    && safety.phones.every((phone) => phone.startsWith("+55000000"))
    && safety.plates.every((plate) => plate.startsWith("DEM"));
  assertDeclared("expected.database_assertions[3]", {
    email_count: safety.emails.length,
    phone_count: safety.phones.length,
    plate_count: safety.plates.length,
    violations: noRealData ? 0 : 1
  }, noRealData);
});
await run("TST-DEMO-DATA-001", executeDataScan);

const api = spawn(process.execPath, ["apps/api/dist/main.js"], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, API_PORT: String(apiPort), DEMO_MODE: "true", COOKIE_SECURE: "false" }, stdio: ["ignore", "pipe", "pipe"] });
let apiErrors = "";
let apiOutput = "";
api.stderr?.on("data", (chunk) => { apiErrors += String(chunk); });
api.stdout?.on("data", (chunk) => { apiOutput += String(chunk); });
try {
  await waitForApi(api);
  for (const testId of g1.required_test_ids as string[]) {
    if (passed.includes(testId)) continue;
    const test = tests.get(testId) as Row;
    const action = test.action as Row;
    if (action.type === "HTTP") {
      await run(testId, async () => {
        const result = await executeHttp(testId);
        if (testId === "TST-AUTH-SESSION-003") {
          const revoked = await withClient(async (client) => (await client.query<{ revocation_reason_code: string | null }>(`SELECT revocation_reason_code FROM demo_internal_session WHERE id='9c96e7d4-60b8-5789-8c95-2c6a0d07a775'`)).rows[0]);
          invariant(revoked.revocation_reason_code === "REPLACED_BY_NEW_SESSION", "old session was not revoked on replacement");
          assertDeclared("expected.database_assertions[0]", revoked.revocation_reason_code, revoked.revocation_reason_code === "REPLACED_BY_NEW_SESSION");
        }
        if (testId === "TST-AUDIT-003") {
          const audit = await withClient(async (client) => (await client.query<{ count: string; preserved: string; target_audit: string; rows: Row[] }>(`
            SELECT count(*)::text AS count,
                   (SELECT count(*)::text FROM security_audit_record WHERE id='f6c8f964-9304-5c71-9a6a-10ad000c9dea') AS preserved,
                   (SELECT count(*)::text FROM security_audit_record WHERE action_code='DEMO_RESET_REQUESTED' AND resource_type='DEMO_RESET') AS target_audit,
                   (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.occurred_at,a.id) FROM security_audit_record a) AS rows
              FROM security_audit_record
          `)).rows[0]);
          invariant(Number(audit.count) >= 2 && audit.preserved === "1" && audit.target_audit === "1", "reset did not preserve and append the expected audit records");
          assertDeclared("expected.database_assertions[0]", Number(audit.preserved), audit.preserved === "1");
          assertDeclared("expected.database_assertions[1]", Number(audit.target_audit), audit.target_audit === "1");
          assertDeclared("expected.database_assertions[2]", containsSecretMaterial(audit.rows) ? "secret_detected" : "no_secrets", !containsSecretMaterial(audit.rows), {
            audited_rows: audit.rows.length
          });
        }
        if (testId === "TST-DEMO-RESET-001") {
          const resetId = String(((result.body?.data as Row | undefined)?.reset_id));
          const state = await withClient(async (client) => (await client.query<{ status: string; source_generation_id: string; source_status: string; target_status: string; runtime_status: string; active_generation_id: string; target_generation_id: string; audit_count: string; outbox_count: string; event_count: string; demo_clock: Date }>(`
            SELECT e.status,e.source_generation_id,source.status AS source_status,target.status AS target_status,
                   r.runtime_status,r.active_generation_id,e.target_generation_id,
                   (SELECT count(*)::text FROM security_audit_record WHERE resource_id=e.id) AS audit_count,
                   (SELECT count(*)::text FROM integration_outbox WHERE event_type='DemoResetRequested') AS outbox_count,
                   (SELECT count(*)::text FROM domain_event WHERE aggregate_id=e.id AND event_type='DemoResetRequested') AS event_count,
                   (SELECT c."current_time" FROM demo_clock c LIMIT 1) AS demo_clock
              FROM demo_reset_execution e
              JOIN demo_generation source ON source.id=e.source_generation_id
              JOIN demo_generation target ON target.id=e.target_generation_id
              JOIN demo_runtime_control r ON r.singleton_key=TRUE
             WHERE e.id=$1
          `, [resetId])).rows[0]);
          invariant(state?.status === "COMPLETED", "demo reset did not complete");
          invariant(state.source_status === "RETIRED" && state.target_status === "ACTIVE", "reset generation states are incorrect");
          invariant(state.runtime_status === "ACTIVE" && state.active_generation_id === state.target_generation_id, "runtime did not activate the target generation");
          invariant(Number(state.audit_count) >= 1 && Number(state.outbox_count) >= 1, "reset audit or outbox effect is missing");
          assertDeclared("expected.states.reset", state.status, state.status === "COMPLETED");
          assertDeclared("expected.states.runtime_status", state.runtime_status, state.runtime_status === "ACTIVE");
          assertDeclared("expected.states.active_generation_id", state.active_generation_id, state.active_generation_id === state.target_generation_id);
          assertDeclared("expected.states.source_generation", state.source_status, state.source_status === "RETIRED");
          const seedClock = new Date(String(resolved.fixtures["FX-SEED-V213"].tables.demo_clock[0].current_time)).toISOString();
          const actualClock = new Date(state.demo_clock).toISOString();
          assertDeclared("expected.states.demo_clock", actualClock, actualClock === seedClock);
          const reseed = await compareReseedToManifest(state.target_generation_id);
          assertDeclared("expected.database_assertions[0]", reseed, (reseed.mismatches as string[]).length === 0);
          const queues = await resetQueueState(state.source_generation_id);
          const staleQueueRows = Object.values(queues).some((value) => (value as Row).status === "PRESENT" && Number((value as Row).source_generation_rows) > 0);
          assertDeclared("expected.database_assertions[1]", queues, !staleQueueRows);
          assertDeclared("expected.database_assertions[2]", {
            reset_history_rows: 1,
            audit_rows: Number(state.audit_count),
            event_rows: Number(state.event_count),
            outbox_rows: Number(state.outbox_count)
          }, Number(state.audit_count) >= 1 && Number(state.event_count) === 1 && Number(state.outbox_count) >= 1);
        }
      });
      continue;
    }
    if (action.type === "DB_PROGRAM") {
      await run(testId, () => executeDatabaseProgram(testId));
      continue;
    }
    if (action.type === "SCENARIO" && testId === "TST-DATA-RESET-005") {
      await run(testId, executeScenarioReset005);
      continue;
    }
    throw new Error(`unhandled G1 contract ${testId} (${String(action.type)})`);
  }
} catch (error) {
  if (apiErrors) process.stderr.write(apiErrors);
  if (apiOutput) process.stderr.write(apiOutput);
  throw error;
} finally {
  api.kill();
}

invariant(passed.length === 26, `executed ${passed.length} of 26 G1 contracts`);
console.log(JSON.stringify({ status: "PASS", executed_contracts: passed.length, declared_assertions: declaredAssertionTotal }));
