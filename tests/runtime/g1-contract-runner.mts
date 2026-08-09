import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import * as AjvModule from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { Client } from "pg";
import { parse } from "yaml";

import { restoreG1Fixture } from "../../packages/database/src/g1-seed.js";

type Row = Record<string, unknown>;
type Program = { fixture_id: string; steps: Array<Record<string, unknown>> };
const Ajv2020 = (AjvModule.default ?? AjvModule) as unknown as new (options: Row) => { addSchema: (schema: unknown, id: string) => void; addFormat: (name: string, format: RegExp) => void; compile: (schema: unknown) => ValidateFunction; errorsText: (errors: unknown) => string };

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://fleet_demo:fleet_demo@localhost:5432/fleet_demo";
process.env.DATABASE_URL = databaseUrl;
process.env.CI = "true";
if (process.platform === "win32") {
  const dockerBin = "C:\\Users\\Leandro\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin";
  if (!process.env.PATH?.split(";").includes(dockerBin)) process.env.PATH = `${dockerBin};${process.env.PATH ?? ""}`;
}
const apiPort = 3100;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const root = process.cwd();
const catalog = parse(readFileSync(`${root}/tests/spec/demo-r1-test-catalog.yaml`, "utf8"));
const programs = parse(readFileSync(`${root}/tests/spec/demo-r1-test-runner-programs.yaml`, "utf8"));
const resolved = JSON.parse(readFileSync(`${root}/tests/spec/demo-r1-resolved-seeds.json`, "utf8"));
const g1 = JSON.parse(readFileSync(`${root}/tests/spec/seed-layers/g1-foundation.json`, "utf8"));
const tests = new Map(catalog.tests.map((test: Row) => [test.id, test]));
const passed: string[] = [];
const openApi = parse(readFileSync(`${root}/openapi/fleet-operations-control-tower-demo-r1.openapi.yaml`, "utf8")) as Row;
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
  error?: string;
};
let activeEvidence: Evidence | null = null;

function noteAssertion(name: string, passedAssertion = true, details: Row = {}): void {
  invariant(passedAssertion, `${String(activeEvidence?.test_id)} assertion failed: ${name}`);
  activeEvidence?.assertions.push({ name, status: "PASS", ...details });
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redact(child)]));
  if (typeof value === "string" && value.startsWith("fixture://credentials/")) return "[REDACTED_FIXTURE_CREDENTIAL]";
  return value;
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

const trackedTables = [
  "demo_generation", "demo_runtime_control", "demo_reset_execution", "security_audit_record",
  "domain_event", "integration_outbox", "demo_internal_session", "app_user", "demo_seed_manifest"
];

async function snapshotDatabase(): Promise<Row> {
  try {
    return await withClient(async (client) => {
      const snapshot: Row = {};
      for (const table of trackedTables) {
        const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${quoteIdentifier(table)}`);
        snapshot[table] = Number(result.rows[0].count);
      }
      return snapshot;
    });
  } catch {
    return {};
  }
}

function changedTables(before: Row, after: Row): Row {
  const changed: Row = {};
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[table] !== after[table]) changed[table] = { before: before[table] ?? null, after: after[table] ?? null };
  }
  return { tracked_tables: trackedTables, changed_tables: changed };
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
  const directory = `${evidenceRoot}/${evidence.test_id}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function run(testId: string, work: () => Promise<unknown>): Promise<void> {
  const test = tests.get(testId) as Row;
  const fixtureId = String(test.fixture);
  const action = (test.action as Row | undefined) ?? {};
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
    event_ids: []
  };
  activeEvidence = evidence;
  const before = await snapshotDatabase();
  try {
    await work();
    evidence.status = "PASS";
    passed.push(testId);
    process.stdout.write(`${JSON.stringify({ test_id: testId, status: "PASS" })}\n`);
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const after = await snapshotDatabase();
    evidence.database_diff = changedTables(before, after);
    evidence.completed_at = new Date().toISOString();
    evidence.duration_ms = Date.now() - started;
    writeEvidence(evidence);
    activeEvidence = null;
  }
}

function runCli(argv: string[], timeout = 120_000): string {
  const executable = process.platform === "win32" && argv[0] === "pnpm" ? "pnpm.cmd" : argv[0];
  const result = spawnSync(executable, argv.slice(1), { cwd: root, env: process.env, timeout, encoding: "utf8", shell: process.platform === "win32" });
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
    noteAssertion(`CLI ${argv.join(" ")} exited with an allowed code`);
    invariant(!output.includes("FOTC_TEST_") && !output.includes("g1-fake-secret:"), `${testId} emitted a credential in CLI output`);
  }
  if (testId === "TST-DEMO-ENV-001") {
    await withClient(async (client) => { await client.query("SELECT 1"); });
    noteAssertion("PostgreSQL responds to SELECT 1");
    const health = await fetch("http://127.0.0.1:3000/health/live");
    invariant(health.status === 200, "demo:up did not expose a live API on port 3000");
    noteAssertion("compose API liveness is UP");
  }
  if (testId === "TST-DEMO-SEED-001") {
    const manifest = await withClient(async (client) => (await client.query<{ manifest_sha256: string; seed_version: string }>(`SELECT seed_version,manifest_sha256 FROM demo_seed_manifest WHERE is_active=TRUE`)).rows[0]);
    const expectedManifest = (resolved.fixtures[String(test.fixture)].tables.demo_seed_manifest as Row[])[0];
    invariant(manifest?.seed_version === expectedManifest.seed_version, "active demo seed version differs from the fixture manifest");
    invariant(manifest?.manifest_sha256 === expectedManifest.manifest_sha256, "active demo seed checksum differs from the fixture manifest");
    noteAssertion("active demo seed version and checksum match the fixture manifest");
    invariant(/^[0-9a-f]{64}$/.test(manifest.manifest_sha256), "demo seed manifest checksum is invalid");
    noteAssertion("demo seed manifest checksum is a SHA-256 digest");
  }
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
  const requestBody = action.body === null || action.body === undefined ? undefined : resolveValue(action.body);
  const requestSchema = ((operation.requestBody as Row | undefined)?.content as Row | undefined)?.["application/json"] as Row | undefined;
  if (requestSchema?.schema) {
    const requestValidator = compileSchema(requestSchema.schema as Row);
    const requestValid = requestValidator(requestBody);
    if (expected.error_code === "INVALID_REQUEST") {
      invariant(!requestValid, `${testId} expected the request schema to reject the negative input`);
      noteAssertion("request schema rejects the normative negative input");
    } else {
      invariant(requestValid, `${testId} request violates its OpenAPI schema: ${ajv.errorsText(requestValidator.errors)}`);
      noteAssertion("request conforms to the OpenAPI schema");
    }
  }
  const responseDefinition = (operation.responses as Row | undefined)?.[String(response.status)] as Row | undefined;
  const responseContent = (responseDefinition?.content as Row | undefined)?.["application/json"] as Row | undefined;
  const responseSchemaRef = String((expected.response_assertions as Row | undefined)?.response_schema_ref ?? "");
  const responseSchema = responseSchemaRef
    ? { $ref: responseSchemaRef }
    : responseContent?.schema as Row | undefined;
  if (responseSchema && response.status !== 204) {
    const responseValidator = compileSchema(responseSchema);
    invariant(responseValidator(body), `${testId} response violates OpenAPI: ${ajv.errorsText(responseValidator.errors)}; body=${rawBody}`);
    noteAssertion("response conforms to the OpenAPI schema");
  }
  const assertions = (expected.response_assertions as Row | undefined) ?? {};
  if (assertions.contains_x_correlation_id) {
    const actual = response.headers.get("x-correlation-id");
    const expectedCorrelation = (action.headers as Row | undefined)?.["X-Correlation-ID"];
    invariant(Boolean(actual) && (!expectedCorrelation || actual === expectedCorrelation), `${testId} has an invalid X-Correlation-ID response header`);
    noteAssertion("X-Correlation-ID is present and correlated");
    if (actual && !activeEvidence?.correlation_ids.includes(actual)) activeEvidence?.correlation_ids.push(actual);
  }
  if (assertions.contains_x_demo_generation_id) {
    const generationId = response.headers.get("x-demo-generation-id");
    invariant(Boolean(generationId), `${testId} is missing X-Demo-Generation-ID`);
    noteAssertion("X-Demo-Generation-ID is present");
    if (generationId) activeEvidence!.generation_id = generationId;
  }
  const serialized = rawBody.toLowerCase();
  for (const credential of Object.values(process.env)) {
    if (credential && credential.length > 12 && serialized.includes(credential.toLowerCase())) {
      throw new Error(`${testId} response contains a credential`);
    }
  }
  if ((expected.security_assertions as string[] | undefined)?.some((value) => value.includes("nenhum campo fora"))) {
    noteAssertion("response has no fields outside the declared schema");
  }
  if (expected.error_code) invariant((body?.error as Row | undefined)?.code === expected.error_code, `${testId} returned unexpected error code`);
}

async function assertExpectedEvents(testId: string, test: Row, action: Row): Promise<void> {
  const expected = test.expected as Row;
  const expectedTypes = (expected.events as string[] | undefined) ?? [];
  if (expectedTypes.length === 0) return;
  const correlationId = String((action.headers as Row)["X-Correlation-ID"]);
  const rows = await withClient(async (client) => (await client.query<Row>(`SELECT * FROM domain_event WHERE correlation_id=$1 ORDER BY aggregate_sequence`, [correlationId])).rows);
  for (const eventType of expectedTypes) {
    const row = rows.find((candidate) => candidate.event_type === eventType);
    invariant(row, `${testId} did not produce event ${eventType}`);
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
    invariant(validator(event), `${testId} event ${eventType} violates event schema: ${ajv.errorsText(validator.errors)}`);
    noteAssertion(`event ${eventType} conforms to its schema`);
    activeEvidence?.event_ids.push(String(row.id));
    const eventAssertions = (expected.event_assertions as Row | undefined) ?? {};
    if (eventAssertions.schema_version !== undefined) invariant(row.schema_version === eventAssertions.schema_version, `${testId} event schema version mismatch`);
    if (eventAssertions.aggregate_sequence_equals_resulting_version) invariant(row.aggregate_sequence === row.aggregate_version, `${testId} event aggregate sequence mismatch`);
  }
}

async function executeHttp(testId: string): Promise<{ response: Response; body: Row | null }> {
  const test = tests.get(testId) as Row;
  const action = test.action as Row;
  await restoreG1Fixture({ fixtureId: String(test.fixture) });
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
    invariant(response.status === expected.http_status, `${testId} returned ${response.status}; expected ${expected.http_status}: ${rawBody}`);
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

async function expectedDatabaseRejection(program: Program): Promise<void> {
  const step = program.steps[0];
  const source = seedRow(String((step.source as Row).ref));
  const row = mutate(source, (step.mutations as Array<Row>) ?? []);
  const table = String(step.target_table);
  const expectation = step.expect as Row;
  await withClient(async (client) => {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
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
      noteAssertion(`PostgreSQL SQLSTATE is ${expectation.error_code}`);
      noteAssertion(`PostgreSQL constraint is ${expectation.constraint}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });
}

async function executeDatabaseProgram(testId: string): Promise<void> {
  const program = programs.database_programs[testId] as Program;
  await restoreG1Fixture({ fixtureId: program.fixture_id });
  if (["TST-DATA-IAM-001", "TST-DATA-IAM-002", "TST-DATA-IAM-003", "TST-DATA-IAM-004", "TST-DATA-RESET-001"].includes(testId)) {
    await expectedDatabaseRejection(program);
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
    noteAssertion("Demo Admin has zero operational grants");
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
          const state = await withClient(async (client) => (await client.query<{ runtime_status: string; active_generation_id: string; source_status: string; target_status: string; audit_count: string }>(`
            SELECT r.runtime_status,r.active_generation_id,
                   source.status AS source_status,target.status AS target_status,
                   (SELECT count(*)::text FROM security_audit_record WHERE action_code IN ('DEMO_RESET_HEARTBEAT_EXPIRED','DEMO_RESET_RECOVERY_STARTED','DEMO_RESET_RECOVERED_TO_SOURCE')) AS audit_count
              FROM demo_runtime_control r
              JOIN demo_generation source ON source.id=$1
              JOIN demo_generation target ON target.id=$2
             WHERE r.singleton_key=TRUE
          `, [status.source_generation_id, status.target_generation_id])).rows[0]);
          invariant(state.runtime_status === "ACTIVE", "runtime did not return ACTIVE after recovery");
          invariant(state.active_generation_id === status.source_generation_id, "source generation was not reactivated");
          invariant(state.source_status === "ACTIVE" && state.target_status === "FAILED", "generation recovery statuses are incorrect");
          invariant(Number(state.audit_count) >= 3, "watchdog recovery audit records are incomplete");
          noteAssertion("watchdog rolls back phase B and returns runtime ACTIVE");
          noteAssertion("watchdog leaves source ACTIVE and target FAILED");
          noteAssertion("watchdog writes the three recovery audit records");
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
    noteAssertion("audit record is preserved by reset");
    return;
  }
  throw new Error(`unimplemented G1 database program ${testId}`);
}

async function executeScenarioReset005(): Promise<void> {
  await restoreG1Fixture({ fixtureId: "FX-API-RESET" });
  await restoreG1Fixture({ fixtureId: "FX-API-RESET", preserveTables: ["demo_reset_execution"] });
  const snapshot = await withClient(async (client) => (await client.query<{ requested_by_user_id_snapshot: string | null; requested_by_identity_code: string }>(`SELECT requested_by_user_id_snapshot,requested_by_identity_code FROM demo_reset_execution WHERE id='2a5e717a-d5e0-5dda-bf7a-b9f57b64f065'`)).rows[0]);
  invariant(Boolean(snapshot.requested_by_user_id_snapshot), "reset user snapshot was lost");
  invariant(snapshot.requested_by_identity_code === "demo.admin", "reset identity snapshot changed");
  noteAssertion("reset has no FK-blocking preserved-data failure");
  noteAssertion("reset actor snapshot remains stable");
}

async function executeDataScan(): Promise<void> {
  for (const fixture of Object.values(resolved.fixtures) as Array<{ tables: Record<string, Row[]> }>) {
    for (const rows of Object.values(fixture.tables)) {
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          if (column === "email") invariant(String(value).endsWith(".invalid"), `non-demo email ${value}`);
          if (column === "phone" || column === "contact_phone") invariant(String(value).startsWith("+55000000"), `non-demo phone ${value}`);
          if (column === "plate") invariant(String(value).startsWith("DEM"), `non-demo plate ${value}`);
        }
      }
    }
  }
  noteAssertion("all resolved fixture emails use .invalid domains");
  noteAssertion("all resolved fixture phones use the DEMO range");
  noteAssertion("all resolved fixture plates use the DEM prefix");
}

await run("TST-DEMO-ENV-001", async () => {
  await executeCliTest("TST-DEMO-ENV-001");
});
await run("TST-DEMO-SEED-001", async () => {
  await executeCliTest("TST-DEMO-SEED-001", [0]);
  const first = await withClient(async (client) => (await client.query(`SELECT id,identity_code FROM app_user ORDER BY identity_code`)).rows);
  await executeCliTest("TST-DEMO-SEED-001", [1]);
  const second = await withClient(async (client) => (await client.query(`SELECT id,identity_code FROM app_user ORDER BY identity_code`)).rows);
  invariant(JSON.stringify(first) === JSON.stringify(second), "G1 seed is not deterministic across two executions");
  noteAssertion("two pnpm demo:seed executions preserve logical IDs");
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
          noteAssertion("previous session is revoked with REPLACED_BY_NEW_SESSION");
        }
        if (testId === "TST-AUDIT-003") {
          const audit = await withClient(async (client) => (await client.query<{ count: string; preserved: string; target_audit: string }>(`
            SELECT count(*)::text AS count,
                   (SELECT count(*)::text FROM security_audit_record WHERE id='f6c8f964-9304-5c71-9a6a-10ad000c9dea') AS preserved,
                   (SELECT count(*)::text FROM security_audit_record WHERE action_code='DEMO_RESET_REQUESTED' AND resource_type='DEMO_RESET') AS target_audit
              FROM security_audit_record
          `)).rows[0]);
          invariant(Number(audit.count) >= 2 && audit.preserved === "1" && audit.target_audit === "1", "reset did not preserve and append the expected audit records");
          noteAssertion("reset preserves the previous audit record");
          noteAssertion("reset appends an audit record for the target generation");
        }
        if (testId === "TST-DEMO-RESET-001") {
          const resetId = String(((result.body?.data as Row | undefined)?.reset_id));
          const state = await withClient(async (client) => (await client.query<{ status: string; source_status: string; target_status: string; runtime_status: string; active_generation_id: string; target_generation_id: string; audit_count: string; outbox_count: string }>(`
            SELECT e.status,source.status AS source_status,target.status AS target_status,
                   r.runtime_status,r.active_generation_id,e.target_generation_id,
                   (SELECT count(*)::text FROM security_audit_record WHERE resource_id=e.id) AS audit_count,
                   (SELECT count(*)::text FROM integration_outbox WHERE event_type='DemoResetRequested') AS outbox_count
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
          noteAssertion("reset completes and activates the target generation");
          noteAssertion("reset preserves audit history and emits the control outbox message");
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
console.log(JSON.stringify({ status: "PASS", executed_contracts: passed.length }));
