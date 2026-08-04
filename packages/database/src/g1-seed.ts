import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

type SeedValue = string | number | boolean | null | SeedValue[] | { [key: string]: SeedValue };
type SeedRow = Record<string, SeedValue>;

interface G1Bundle {
  gate: string;
  table_load_order: string[];
  fixtures: Record<string, { tables: Record<string, SeedRow[]>; full_state_sha256: string }>;
}

export interface RestoreG1Options {
  fixtureId?: string;
  preserveTables?: string[];
  targetGenerationId?: string;
  beforeLoad?: (client: PoolClient) => Promise<void>;
  afterLoad?: (client: PoolClient) => Promise<void>;
}

const authorizedTables = new Set([
  "demo_seed_manifest", "demo_generation", "demo_reset_execution", "demo_runtime_control", "demo_clock",
  "operating_unit", "customer", "team", "role", "permission", "app_user", "role_permission", "user_role",
  "team_member", "user_operating_unit_scope", "user_customer_scope", "supplier", "supplier_site", "driver",
  "vehicle", "vehicle_registration", "case_record", "vehicle_stop", "domain_event", "idempotency_record",
  "conversation", "communication_message", "phone_call", "demo_internal_session", "integration_outbox",
  "worker_lease", "security_audit_record"
]);

function quoteIdentifier(value: string): string {
  if (!authorizedTables.has(value) && !/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${value}"`;
}

function resolveSeedValue(value: SeedValue, targetGenerationId?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveSeedValue(item, targetGenerationId));
  if (value !== null && typeof value === "object") {
    if (value.$derive === "SHA256" && typeof value.from === "string") {
      const name = `FOTC_TEST_${value.from.replace("fixture://credentials/", "").replaceAll(".", "_").toUpperCase()}`;
      return createHash("sha256")
        .update(process.env[name] ?? `g1-fake-secret:${name}`)
        .digest("hex");
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveSeedValue(child, targetGenerationId)])
    );
  }
  return value;
}

function remapRow(table: string, row: SeedRow, targetGenerationId?: string): SeedRow {
  if (!targetGenerationId) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (key === "demo_generation_id" || key === "active_generation_id") {
        return [key, targetGenerationId];
      }
      return [key, value];
    })
  );
}

async function insert(client: PoolClient, table: string, row: SeedRow, targetGenerationId?: string): Promise<void> {
  const remapped = remapRow(table, row, targetGenerationId);
  const columns = Object.keys(remapped);
  if (columns.length === 0) return;
  const values = columns.map((column) => resolveSeedValue(remapped[column] ?? null, targetGenerationId));
  await client.query(
    `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns
      .map((_, index) => `$${index + 1}`)
      .join(", ")})`,
    values
  );
}

export async function restoreG1Fixture(options: RestoreG1Options = {}): Promise<{ fixtureStateSha256: string }> {
  const bundlePath = resolve(process.cwd(), "tests/spec/seed-layers/g1-foundation.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as G1Bundle;
  if (bundle.gate !== "G1_FOUNDATION" || bundle.table_load_order.length !== 32) {
    throw new Error("Only the authorized G1 seed bundle may be restored");
  }
  const fixture = bundle.fixtures[options.fixtureId ?? "FX-SEED-V213"];
  if (!fixture) throw new Error("G1 fixture was not found");
  const preserve = new Set(options.preserveTables ?? []);
  const resettable = bundle.table_load_order.filter((table) => !preserve.has(table));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (resettable.length > 0) {
      await client.query(
        `TRUNCATE TABLE ${[...resettable].reverse().map(quoteIdentifier).join(", ")} CASCADE`
      );
    }
    await options.beforeLoad?.(client);
    for (const table of bundle.table_load_order) {
      if (preserve.has(table)) continue;
      for (const row of fixture.tables[table] ?? []) {
        await insert(client, table, row, options.targetGenerationId);
      }
    }
    await options.afterLoad?.(client);
    await client.query("COMMIT");
    return { fixtureStateSha256: fixture.full_state_sha256 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
