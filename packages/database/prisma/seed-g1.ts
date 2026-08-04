import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

type Scalar = string | number | boolean | null;
type SeedValue = Scalar | SeedValue[] | { [key: string]: SeedValue };
type SeedRow = Record<string, SeedValue>;

interface SeedFixture {
  fixture_id: string;
  full_state_sha256: string;
  tables: Record<string, SeedRow[]>;
}

interface G1SeedBundle {
  gate: "G1_FOUNDATION";
  status: "NORMATIVE_AUTHORIZED_FOR_SCAFFOLD";
  seed_contract_sha256: string;
  table_load_order: string[];
  fixtures: Record<string, SeedFixture>;
}

const bundlePath = resolve(
  __dirname,
  "../../../tests/spec/seed-layers/g1-foundation.json"
);

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function credentialEnvironmentName(reference: string): string {
  const prefix = "fixture://credentials/";
  if (!reference.startsWith(prefix)) {
    throw new Error(`Unsupported seed derivation reference: ${reference}`);
  }
  return `FOTC_TEST_${reference.slice(prefix.length).replaceAll(".", "_").toUpperCase()}`;
}

function resolveValue(value: SeedValue): unknown {
  if (Array.isArray(value)) {
    return value.map(resolveValue);
  }
  if (value !== null && typeof value === "object") {
    if (value.$derive === "SHA256" && typeof value.from === "string") {
      const environmentName = credentialEnvironmentName(value.from);
      const secret = process.env[environmentName] ?? `g1-fake-secret:${environmentName}`;
      return createHash("sha256").update(secret).digest("hex");
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveValue(child)]));
  }
  return value;
}

function assertFictitiousRows(table: string, rows: SeedRow[]): void {
  for (const row of rows) {
    for (const [column, raw] of Object.entries(row)) {
      if (typeof raw !== "string") continue;
      if (column === "email" && !raw.endsWith(".invalid")) {
        throw new Error(`${table}.${column} contains a non-demo email`);
      }
      if ((column === "phone" || column === "contact_phone") && !raw.startsWith("+55000000")) {
        throw new Error(`${table}.${column} contains a non-demo phone`);
      }
      if (column === "plate" && !raw.startsWith("DEM")) {
        throw new Error(`${table}.${column} contains an unmanifested plate`);
      }
    }
  }
}

async function insertRows(client: PoolClient, table: string, rows: SeedRow[]): Promise<void> {
  assertFictitiousRows(table, rows);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const values = columns.map((column) => resolveValue(row[column] ?? null));
    const parameters = columns.map((_, index) => `$${index + 1}`).join(", ");
    const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${parameters})`;
    await client.query(sql, values);
  }
}

async function main(): Promise<void> {
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as G1SeedBundle;
  if (bundle.gate !== "G1_FOUNDATION" || bundle.table_load_order.length !== 32) {
    throw new Error("Seed bundle is not the authorized 32-table G1 bundle");
  }

  const fixtureId = process.env.FOTC_G1_FIXTURE_ID ?? "FX-SEED-V213";
  const fixture = bundle.fixtures[fixtureId];
  if (!fixture) throw new Error(`Unknown G1 fixture: ${fixtureId}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reverseOrder = [...bundle.table_load_order].reverse().map(quoteIdentifier).join(", ");
    await client.query(`TRUNCATE TABLE ${reverseOrder} RESTART IDENTITY CASCADE`);
    for (const table of bundle.table_load_order) {
      await insertRows(client, table, fixture.tables[table] ?? []);
    }
    await client.query("COMMIT");
    process.stdout.write(
      JSON.stringify({
        gate: bundle.gate,
        fixture_id: fixture.fixture_id,
        fixture_state_sha256: fixture.full_state_sha256,
        seed_contract_sha256: bundle.seed_contract_sha256,
        table_count: bundle.table_load_order.length
      }) + "\n"
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
