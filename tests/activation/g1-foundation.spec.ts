import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function text(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const apiController = text("apps/api/src/session/session.controller.ts");
const demoController = text("apps/api/src/demo/demo.controller.ts");
const demoService = text("apps/api/src/demo/demo.service.ts");
const sessionService = text("apps/api/src/session/session.service.ts");
const healthController = text("apps/api/src/health/health.controller.ts");
const migration = text(
  "packages/database/prisma/migrations/202608020001_g1_foundation/migration.sql"
);
const contractNameMigration = text(
  "packages/database/prisma/migrations/202608040001_g1_contract_constraint_names/migration.sql"
);
const worker = text("apps/worker/src/main.ts");
const compose = text("compose.yaml");
const openapi = text("openapi/fleet-operations-control-tower-demo-r1.openapi.yaml");
const testCatalog = text("tests/spec/demo-r1-test-catalog.yaml");
const runnerPrograms = text("tests/spec/demo-r1-test-runner-programs.yaml");
const seedManifest = parse(text("tests/spec/demo-r1-seed-manifest.yaml")) as {
  fixtures: Record<string, { state_sha256: string; used_by_test_ids?: string[] }>;
};
const parsedCatalog = parse(testCatalog) as {
  tests: Array<Record<string, unknown>>;
};
const parsedPrograms = parse(runnerPrograms) as {
  database_programs: Record<string, Record<string, unknown>>;
  scenario_programs: Record<string, Record<string, unknown>>;
};
const fixtureSnapshot = parse(text("tests/spec/demo-r1-test-fixtures.yaml")) as {
  snapshots: Record<string, { state_sha256: string }>;
};
const seedRaw = text("tests/spec/seed-layers/g1-foundation.json");
const resolvedSeed = JSON.parse(text("tests/spec/demo-r1-resolved-seeds.json")) as {
  fixtures: Record<string, { tables: Record<string, unknown[]>; used_by_test_ids?: string[] }>;
};
const seed = JSON.parse(seedRaw) as {
  gate: string;
  required_test_ids: string[];
  table_load_order: string[];
  fixtures: Record<string, { full_state_sha256: string; tables: Record<string, unknown[]> }>;
};
const layer = JSON.parse(seedRaw) as {
  required_fixture_ids: string[];
  fixtures: Record<string, { tables: Record<string, unknown[]>; full_state_sha256: string; layer_state_sha256: string }>;
};

function catalogTest(testId: string): Record<string, unknown> {
  const found = parsedCatalog.tests.find((candidate) => candidate.id === testId);
  expect(found, `catalog entry ${testId}`).toBeDefined();
  return found as Record<string, unknown>;
}

function runnerProgram(testId: string): Record<string, unknown> {
  const found = parsedPrograms.database_programs[testId] ?? parsedPrograms.scenario_programs[testId];
  expect(found, `runner program ${testId}`).toBeDefined();
  return found as Record<string, unknown>;
}

function fixtureId(testId: string): string {
  return String(catalogTest(testId).fixture);
}

function fixtureRefs(testId: string): string[] {
  return (catalogTest(testId).fixture_refs as string[]) ?? [];
}

describe("G1_FOUNDATION — 26 activation tests", () => {
  it("TST-API-GET-LIVENESS-001", () => {
    expect(healthController).toContain('@Get("live")');
    expect(healthController).toContain('status: "UP"');
    expect(openapi).toContain("operationId: getLiveness");
  });

  it("TST-API-GET-READINESS-001", () => {
    expect(healthController).toContain('@Get("ready")');
    expect(healthController).toContain("demoSeedManifest.findFirst");
    expect(openapi).toContain("operationId: getReadiness");
  });

  it("TST-API-CREATE-DEMO-SESSION-001", () => {
    expect(apiController).toContain('@Post("api/v1/demo/sessions")');
    expect(apiController).toContain("X-CSRF-Token");
    expect(apiController).toContain("identity_code");
  });

  it("TST-API-DELETE-DEMO-SESSION-001", () => {
    expect(apiController).toContain('@Delete("api/v1/demo/sessions/current")');
    expect(sessionService).toContain('revocationReasonCode: "USER_LOGOUT"');
  });

  it("TST-API-GET-CURRENT-SESSION-001", () => {
    expect(apiController).toContain('@Get("api/v1/session")');
    expect(apiController).toContain('permission: "session.read"');
  });

  it("TST-API-GET-DEMO-STATUS-001", () => {
    expect(demoController).toContain('@Get("status")');
    expect(demoController).toContain('permission: "demo.read_status"');
    expect(demoService).toContain("Ambiente de demonstração — dados fictícios");
    expect(fixtureId("TST-API-GET-DEMO-STATUS-001")).toBe("FX-API-RESET");
    expect((catalogTest("TST-API-GET-DEMO-STATUS-001").action as Record<string, unknown>).headers).toMatchObject({
      Cookie: "fixture://credentials/internal.admin.cookie"
    });
  });

  it("TST-API-RESET-DEMO-SCENARIO-001", () => {
    expect(demoController).toContain('@Post("reset")');
    expect(demoController).toContain("Idempotency-Key is required");
    expect(demoService).toContain('"DemoResetRequested"');
  });

  it("TST-API-GET-DEMO-RESET-001", () => {
    expect(demoController).toContain('@Get("resets/:resetId")');
    expect(demoService).toContain("RESOURCE_NOT_FOUND");
    expect(fixtureId("TST-API-GET-DEMO-RESET-001")).toBe("FX-API-RESET");
  });

  it("TST-AUTH-SESSION-001", () => {
    for (const identity of [
      "demo.attendant",
      "demo.operations",
      "demo.supervisor",
      "demo.manager",
      "demo.admin"
    ]) {
      expect(apiController).toContain(identity);
    }
    expect(sessionService).toContain("DEMO_IDENTITY_NOT_ALLOWED");
  });

  it("TST-AUTH-SESSION-002", () => {
    expect(apiController).not.toMatch(/role:\s*z\./);
    expect(apiController).not.toMatch(/permissions:\s*z\./);
    expect(apiController).not.toMatch(/scopes:\s*z\./);
    expect((catalogTest("TST-AUTH-SESSION-002").action as Record<string, unknown>).body).toMatchObject({
      role_code: "DEMO_ADMIN"
    });
  });

  it("TST-AUTH-SESSION-003", () => {
    expect(sessionService).toContain("REPLACED_BY_NEW_SESSION");
    expect(sessionService).toContain("replacedBySessionId: sessionId");
  });

  it("TST-AUTH-SESSION-004", () => {
    expect(sessionService).toContain("session.idleExpiresAt <= now");
    expect(sessionService).toContain("session.expiresAt <= now");
    expect(sessionService).toContain("SESSION_EXPIRED");
    expect(((catalogTest("TST-AUTH-SESSION-004").action as Record<string, unknown>).headers as Record<string, unknown>).Cookie)
      .toBe("fixture://credentials/internal.attendant.cookie");
  });

  it("TST-DATA-IAM-001", () => {
    expect(migration).toMatch(/CREATE TABLE "user_role"[\s\S]*"user_id" UUID PRIMARY KEY/);
    expect(contractNameMigration).toContain('RENAME CONSTRAINT "user_role_pkey" TO "pk_user_role"');
  });

  it("TST-DATA-IAM-002", () => {
    expect(migration).toContain('CONSTRAINT "uq_demo_internal_session_token_hash" UNIQUE');
    expect(runnerProgram("TST-DATA-IAM-002").fixture_id).toBe("FX-ACTIVE-ATTENDANT-SESSION");
    expect(JSON.stringify(runnerProgram("TST-DATA-IAM-002"))).toContain("seed://FX-ACTIVE-ATTENDANT-SESSION/tables/demo_internal_session/0");
  });

  it("TST-DATA-IAM-003", () => {
    expect(migration).toContain('CONSTRAINT "ck_demo_internal_session_revocation"');
    expect(runnerProgram("TST-DATA-IAM-003").fixture_id).toBe("FX-ACTIVE-ATTENDANT-SESSION");
    expect(JSON.stringify(runnerProgram("TST-DATA-IAM-003"))).toContain("seed://FX-ACTIVE-ATTENDANT-SESSION/tables/demo_internal_session/0");
  });

  it("TST-DATA-IAM-004", () => {
    expect(migration).toMatch(/CREATE TABLE "user_customer_scope"[\s\S]*REFERENCES "customer"/);
    expect(contractNameMigration).toContain(
      'TO "fk_user_customer_scope_customer"'
    );
  });

  it("TST-DATA-IAM-005", () => {
    const rows = seed.fixtures["FX-DATA-INTEGRITY"]?.tables;
    expect(rows).toBeDefined();
    const users = rows?.app_user as Array<{ id: string; identity_code: string }>;
    const admin = users.find((user) => user.identity_code === "demo.admin");
    expect(admin).toBeDefined();
    expect((rows?.user_customer_scope as Array<{ user_id: string }>).some((x) => x.user_id === admin?.id)).toBe(false);
    expect((rows?.user_operating_unit_scope as Array<{ user_id: string }>).some((x) => x.user_id === admin?.id)).toBe(false);
  });

  it("TST-DATA-RESET-001", () => {
    expect(contractNameMigration).toContain(
      'ALTER INDEX "uq_demo_reset_active"'
    );
    expect(contractNameMigration).toContain(
      'RENAME TO "uq_demo_reset_running"'
    );
    expect(migration).toContain("WHERE \"status\" IN ('REQUESTED','RUNNING','RECOVERING')");
  });

  it("TST-DATA-RESET-002", () => {
    expect(worker).toContain("RESET_OWNER_LOST_RECOVERED_TO_SOURCE");
    expect(worker).toContain("DEMO_RESET_HEARTBEAT_EXPIRED");
    expect(worker).toContain("DEMO_RESET_RECOVERED_TO_SOURCE");
  });

  it("TST-DATA-RESET-003", () => {
    expect(migration).toContain('CREATE TABLE "security_audit_record"');
    expect(demoService).toContain('INSERT INTO "security_audit_record"');
  });

  it("TST-DATA-RESET-005", () => {
    const resetTable = migration.match(/CREATE TABLE "demo_reset_execution" \([\s\S]*?\n\);/)?.[0];
    expect(resetTable).toBeDefined();
    expect(resetTable).not.toContain('REFERENCES "app_user"');
    expect(resetTable).toContain("requested_by_user_id_snapshot");
    expect(runnerProgram("TST-DATA-RESET-005").fixture_id).toBe("FX-API-RESET");
  });

  it("TST-AUDIT-003", () => {
    expect(demoService).toContain('"DEMO_RESET_REQUESTED"');
    expect(demoService).not.toMatch(/sessionToken|csrfToken/);
    expect(fixtureId("TST-AUDIT-003")).toBe("FX-API-RESET");
  });

  it("TST-DEMO-DATA-001", () => {
    const fixture = seed.fixtures["FX-SEED-V213"];
    expect(fixture).toBeDefined();
    for (const rows of Object.values(fixture.tables)) {
      for (const row of rows) {
        for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
          if (key === "email") expect(String(value)).toMatch(/\.invalid$/);
          if (key === "phone") expect(String(value)).toMatch(/^\+55000000/);
          if (key === "plate") expect(String(value)).toMatch(/^DEM/);
        }
      }
    }
  });

  it("TST-DEMO-ENV-001", () => {
    for (const service of ["postgres:", "mailpit:", "api:", "worker:", "web:"]) {
      expect(compose).toContain(service);
    }
    expect(compose).toContain("DEMO_MODE: \"true\"");
  });

  it("TST-DEMO-RESET-001", () => {
    expect(demoService).toContain('status: "COMPLETED"');
    expect(demoService).toContain('"active_generation_id"=$1');
    expect(demoService).toContain('["RETIRED", now, runtime.activeGenerationId]');
  });

  it("TST-DEMO-SEED-001", () => {
    expect(seed.gate).toBe("G1_FOUNDATION");
    expect(seed.required_test_ids).toHaveLength(26);
    expect(seed.table_load_order).toHaveLength(32);
    expect(createHash("sha256").update(seedRaw).digest("hex")).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(catalogTest("TST-DEMO-SEED-001"))).toContain(
      "Manifesto seed v2.1.3 disponível."
    );
  });

  it("G1 assembly is structurally executable", () => {
    const catalogIds = new Set(parsedCatalog.tests.map((candidate) => String(candidate.id)));
    expect(seed.required_test_ids.every((testId) => catalogIds.has(testId))).toBe(true);
    expect(seed.required_test_ids).toHaveLength(26);
    expect(layer.required_fixture_ids).toEqual(expect.arrayContaining(Object.keys(layer.fixtures)));

    for (const testId of seed.required_test_ids) {
      const test = catalogTest(testId);
      const refs = fixtureRefs(testId);
      expect(resolvedSeed.fixtures[String(test.fixture)]).toBeDefined();
      expect(layer.fixtures[String(test.fixture)]).toBeDefined();
      for (const fixture of refs) {
        expect(layer.required_fixture_ids).toContain(fixture);
        expect(resolvedSeed.fixtures[fixture]).toBeDefined();
        expect(layer.fixtures[fixture]).toBeDefined();
      }
      const programId = (test.action as Record<string, unknown> | undefined)?.program_id;
      if (typeof programId === "string") {
        const program = runnerProgram(programId);
        expect(program.fixture_id).toBe(String(test.fixture));
      }
    }

    const resetProgram = runnerProgram("TST-DATA-RESET-001");
    expect(resetProgram.fixture_id).toBe("FX-DATA-INTEGRITY");
    expect(JSON.stringify(resetProgram)).toContain("seed://FX-DATA-INTEGRITY/tables/demo_reset_execution/1");
    expect(layer.fixtures["FX-API-RESET"].tables.demo_internal_session).toHaveLength(1);
    expect(layer.fixtures["FX-API-RESET"].tables.demo_reset_execution).toHaveLength(1);
    expect(layer.fixtures["FX-DATA-INTEGRITY"].tables.demo_reset_execution).toHaveLength(2);
    expect(layer.fixtures["FX-API-RESET"].tables.security_audit_record).toHaveLength(1);
    const adminSession = layer.fixtures["FX-API-RESET"].tables.demo_internal_session[0] as Record<string, unknown>;
    expect((adminSession.session_token_hash as Record<string, unknown>).from).toBe("fixture://credentials/internal.admin.cookie");
    expect((layer.fixtures["FX-API-RESET"].tables.demo_reset_execution[0] as Record<string, unknown>).status).toBe("COMPLETED");
    expect((layer.fixtures["FX-DATA-INTEGRITY"].tables.demo_reset_execution[1] as Record<string, unknown>).status).toBe("RUNNING");
    expect(seedManifest.fixtures["FX-API-RESET"].state_sha256).toBe(layer.fixtures["FX-API-RESET"].full_state_sha256);
    expect(fixtureSnapshot.snapshots["FX-API-RESET"].state_sha256).toBe(seedManifest.fixtures["FX-API-RESET"].state_sha256);
  });
});
