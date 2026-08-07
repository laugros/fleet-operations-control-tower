import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

import { Client } from "pg";
import { parse } from "yaml";

import { restoreG1Fixture } from "../../packages/database/src/g1-seed";

type Row = Record<string, unknown>;
type Program = { fixture_id: string; steps: Array<Record<string, unknown>> };

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://fleet_demo:fleet_demo@localhost:5432/fleet_demo";
process.env.DATABASE_URL = databaseUrl;
const apiPort = 3100;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const root = process.cwd();
const catalog = parse(readFileSync(`${root}/tests/spec/demo-r1-test-catalog.yaml`, "utf8"));
const programs = parse(readFileSync(`${root}/tests/spec/demo-r1-test-runner-programs.yaml`, "utf8"));
const resolved = JSON.parse(readFileSync(`${root}/tests/spec/demo-r1-resolved-seeds.json`, "utf8"));
const g1 = JSON.parse(readFileSync(`${root}/tests/spec/seed-layers/g1-foundation.json`, "utf8"));
const tests = new Map(catalog.tests.map((test: Row) => [test.id, test]));
const passed: string[] = [];

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

async function run(testId: string, work: () => Promise<void>): Promise<void> {
  await work();
  passed.push(testId);
  process.stdout.write(`${JSON.stringify({ test_id: testId, status: "PASS" })}\n`);
}

function runCli(argv: string[], timeout = 120_000): void {
  const executable = process.platform === "win32" && argv[0] === "pnpm" ? "pnpm.cmd" : argv[0];
  const result = spawnSync(executable, argv.slice(1), { cwd: root, env: process.env, timeout, encoding: "utf8", shell: process.platform === "win32" });
  invariant(result.status === 0, `${argv.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
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
    if (expected.error_code) invariant((body?.error as Row | undefined)?.code === expected.error_code, `${testId} returned unexpected error code`);
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
    return;
  }
  if (testId === "TST-DATA-RESET-002") {
    const worker = spawn(process.execPath, ["apps/worker/dist/main.js"], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, DEMO_MODE: "true", WORKER_INSTANCE_ID: "g1-contract-runner" }, stdio: "ignore" });
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const status = await withClient(async (client) => (await client.query<{ status: string; failure_code: string | null }>(`SELECT status,failure_code FROM demo_reset_execution WHERE id='0f18c55b-46d4-59a3-94d9-ea2b8517d7cc'`)).rows[0]);
        if (status?.status === "FAILED") {
          invariant(status.failure_code === "RESET_OWNER_LOST_RECOVERED_TO_SOURCE", "watchdog used unexpected failure code");
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
}

await run("TST-DEMO-ENV-001", async () => {
  const compose = readFileSync(`${root}/compose.yaml`, "utf8");
  for (const service of ["postgres", "mailpit", "api", "worker", "web"]) invariant(compose.includes(`${service}:`), `${service} is absent from compose.yaml`);
  await withClient(async (client) => { await client.query("SELECT 1"); });
});
await run("TST-DEMO-SEED-001", async () => {
  runCli(["pnpm", "demo:seed"]);
  const first = await withClient(async (client) => (await client.query(`SELECT id,identity_code FROM app_user ORDER BY identity_code`)).rows);
  runCli(["pnpm", "demo:seed"]);
  const second = await withClient(async (client) => (await client.query(`SELECT id,identity_code FROM app_user ORDER BY identity_code`)).rows);
  invariant(JSON.stringify(first) === JSON.stringify(second), "G1 seed is not deterministic across two executions");
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
        }
        if (testId === "TST-AUDIT-003") {
          const count = await withClient(async (client) => (await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM security_audit_record`)).rows[0].count);
          invariant(Number(count) >= 2, "reset did not preserve and append audit records");
        }
        if (testId === "TST-DEMO-RESET-001") {
          const resetId = String(((result.body?.data as Row | undefined)?.reset_id));
          const state = await withClient(async (client) => (await client.query<{ status: string }>(`SELECT status FROM demo_reset_execution WHERE id=$1`, [resetId])).rows[0]);
          invariant(state?.status === "COMPLETED", "demo reset did not complete");
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
