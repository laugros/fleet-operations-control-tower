import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const root = process.cwd();
const resolvedPath = `${root}/tests/spec/demo-r1-resolved-seeds.json`;
const resolved = JSON.parse(readFileSync(resolvedPath, "utf8"));
const fixtures = resolved.fixtures;

const apiReset = fixtures["FX-API-RESET"];
const integrity = fixtures["FX-DATA-INTEGRITY"];
const adminSession = structuredClone(fixtures["FX-DEMO-ADMIN-SESSION"].tables.demo_internal_session[0]);
adminSession.session_token_hash.from = "fixture://credentials/internal.admin.cookie";
adminSession.csrf_token_hash.from = "fixture://credentials/internal.admin.csrf";

const completedReset = structuredClone(integrity.tables.demo_reset_execution[0]);
const auditRecord = structuredClone(integrity.tables.security_audit_record[0]);
const runningReset = {
  ...structuredClone(completedReset),
  id: "0f18c55b-46d4-59a3-94d9-ea2b8517d7cc",
  status: "RUNNING",
  database_reset_started_at: "2026-08-01T15:00:30Z",
  database_reset_committed_at: null,
  projections_rebuilt_at: null,
  completed_at: null,
  failed_at: null,
  failure_code: null,
  warning_codes: [],
  lease_owner_instance_id: "seed-owner",
  heartbeat_at: "2026-08-01T15:00:30Z",
  lease_expires_at: "2026-08-01T15:05:30Z",
  recovery_attempt_count: 0,
  last_recovery_started_at: null,
  recovered_by_instance_id: null
};

apiReset.tables.demo_internal_session = [adminSession];
apiReset.tables.demo_reset_execution = [completedReset, runningReset];
apiReset.tables.security_audit_record = [auditRecord];
apiReset.used_by_test_ids = [
  "TST-API-ADVANCE-DEMO-CLOCK-001",
  "TST-API-GET-DEMO-RESET-001",
  "TST-API-GET-DEMO-STATUS-001",
  "TST-API-RESET-DEMO-SCENARIO-001",
  "TST-AUDIT-003",
  "TST-DATA-RESET-001",
  "TST-DATA-RESET-005"
];

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}

apiReset.state_sha256 = hash(apiReset.tables);
apiReset.full_state_sha256 = apiReset.state_sha256;
apiReset.layer_state_sha256 = apiReset.state_sha256;
fixtures["FX-API-READ-BASE"].used_by_test_ids = fixtures["FX-API-READ-BASE"].used_by_test_ids.filter((id) => id !== "TST-API-GET-DEMO-STATUS-001");
fixtures["FX-DATA-INTEGRITY"].used_by_test_ids = fixtures["FX-DATA-INTEGRITY"].used_by_test_ids.filter((id) => id !== "TST-DATA-RESET-001");

writeFileSync(resolvedPath, `${JSON.stringify(resolved, null, 2)}\n`);

for (const name of ["g1-foundation.json", "g2-domain.json", "g3-projections.json", "g4-time-communication.json", "g5-external.json", "g6-executive.json"]) {
  const path = `${root}/tests/spec/seed-layers/${name}`;
  const layer = JSON.parse(readFileSync(path, "utf8"));
  const target = layer.fixtures["FX-API-RESET"];
  for (const table of Object.keys(target.tables)) target.tables[table] = structuredClone(apiReset.tables[table] ?? []);
  target.used_by_test_ids = structuredClone(apiReset.used_by_test_ids);
  target.full_state_sha256 = apiReset.state_sha256;
  target.layer_state_sha256 = hash(target.tables);
  layer.source_resolved_seed = "tests/spec/demo-r1-resolved-seeds.json";
  writeFileSync(path, `${JSON.stringify(layer, null, 2)}\n`);
}

console.log(JSON.stringify({ fixture: "FX-API-RESET", full_state_sha256: apiReset.full_state_sha256, active_reset_id: runningReset.id }, null, 2));
