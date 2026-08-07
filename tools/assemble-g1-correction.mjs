import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

const root = process.cwd();
const resolvedPath = `${root}/tests/spec/demo-r1-resolved-seeds.json`;
const resolved = JSON.parse(readFileSync(resolvedPath, "utf8"));
const fixtures = resolved.fixtures;
const catalog = parse(readFileSync(`${root}/tests/spec/demo-r1-test-catalog.yaml`, "utf8"));

const apiReset = fixtures["FX-API-RESET"];
const integrity = fixtures["FX-DATA-INTEGRITY"];
const apiReadBase = fixtures["FX-API-READ-BASE"];
const mutatedDemo = fixtures["FX-MUTATED-DEMO"];
const adminSession = structuredClone(fixtures["FX-DEMO-ADMIN-SESSION"].tables.demo_internal_session[0]);
adminSession.session_token_hash.from = "fixture://credentials/internal.admin.cookie";
adminSession.csrf_token_hash.from = "fixture://credentials/internal.admin.csrf";
const operationsSession = structuredClone(adminSession);
operationsSession.id = "4eff8b08-0d5d-58cc-9f71-09eb6bd5f7e8";
operationsSession.user_id = "12bf12cc-fd44-537e-a622-daa43e0eb811";
operationsSession.session_token_hash.from = "fixture://credentials/internal.operations.cookie";
operationsSession.csrf_token_hash.from = "fixture://credentials/internal.operations.csrf";
const mutatedAdminSession = structuredClone(adminSession);
mutatedAdminSession.last_seen_at = "2026-08-03T14:00:00Z";
mutatedAdminSession.idle_expires_at = "2026-08-03T16:00:00Z";
mutatedAdminSession.expires_at = "2026-08-03T20:00:00Z";

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
apiReset.tables.demo_reset_execution = [completedReset];
apiReset.tables.security_audit_record = [auditRecord];
integrity.tables.demo_reset_execution = [completedReset, runningReset];
apiReadBase.tables.demo_internal_session = [operationsSession];
mutatedDemo.tables.demo_internal_session = [mutatedAdminSession];
for (const [fixtureId, fixture] of Object.entries(fixtures)) {
  fixture.used_by_test_ids = catalog.tests
    .filter((test) => test.fixture === fixtureId)
    .map((test) => test.id)
    .sort();
}

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
integrity.state_sha256 = hash(integrity.tables);
apiReadBase.state_sha256 = hash(apiReadBase.tables);
mutatedDemo.state_sha256 = hash(mutatedDemo.tables);
delete apiReset.full_state_sha256;
delete apiReset.layer_state_sha256;

writeFileSync(resolvedPath, `${JSON.stringify(resolved, null, 2)}\n`);

const seedManifestPath = `${root}/tests/spec/demo-r1-seed-manifest.yaml`;
let seedManifestSource = readFileSync(seedManifestPath, "utf8");
for (const [fixtureId, fixture] of Object.entries(fixtures)) {
  const escapedId = fixtureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`(  ${escapedId}:\\r?\\n[\\s\\S]*?    used_by_test_ids:\\r?\\n)(?:    - [^\\r\\n]+\\r?\\n)*(    purpose:)`);
  const list = fixture.used_by_test_ids.map((testId) => `    - ${testId}\n`).join("");
  seedManifestSource = seedManifestSource.replace(block, `$1${list}$2`);
  seedManifestSource = seedManifestSource.replace(
    new RegExp(`(  ${escapedId}:\\r?\\n[\\s\\S]*?    state_sha256: )[0-9a-f]{64}`),
    `$1${fixture.state_sha256}`
  );
}
writeFileSync(seedManifestPath, seedManifestSource);

const fixtureSnapshotPath = `${root}/tests/spec/demo-r1-test-fixtures.yaml`;
let fixtureSnapshotSource = readFileSync(fixtureSnapshotPath, "utf8");
for (const fixtureId of ["FX-API-RESET", "FX-DATA-INTEGRITY", "FX-API-READ-BASE", "FX-MUTATED-DEMO"]) {
  const escapedId = fixtureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  fixtureSnapshotSource = fixtureSnapshotSource.replace(
    new RegExp(`(  ${escapedId}:\\r?\\n[\\s\\S]*?    state_sha256: )[0-9a-f]{64}`),
    `$1${fixtures[fixtureId].state_sha256}`
  );
}
writeFileSync(fixtureSnapshotPath, fixtureSnapshotSource);

for (const name of ["g1-foundation.json", "g2-domain.json", "g3-projections.json", "g4-time-communication.json", "g5-external.json", "g6-executive.json"]) {
  const path = `${root}/tests/spec/seed-layers/${name}`;
  const layer = JSON.parse(readFileSync(path, "utf8"));
  for (const fixtureId of ["FX-API-RESET", "FX-DATA-INTEGRITY", "FX-API-READ-BASE", "FX-MUTATED-DEMO"]) {
    const target = layer.fixtures[fixtureId];
    const source = fixtures[fixtureId];
    for (const table of Object.keys(target.tables)) target.tables[table] = structuredClone(source.tables[table] ?? []);
    target.full_state_sha256 = source.state_sha256;
    target.layer_state_sha256 = hash(target.tables);
  }
  for (const [fixtureId, fixture] of Object.entries(layer.fixtures)) {
    fixture.used_by_test_ids = structuredClone(fixtures[fixtureId].used_by_test_ids);
  }
  layer.source_resolved_seed = "tests/spec/demo-r1-resolved-seeds.json";
  writeFileSync(path, `${JSON.stringify(layer, null, 2)}\n`);
}

console.log(JSON.stringify({
  fixtures_recomposed: ["FX-API-RESET", "FX-DATA-INTEGRITY", "FX-API-READ-BASE", "FX-MUTATED-DEMO"],
  api_reset_state_sha256: apiReset.state_sha256,
  active_reset_fixture: "FX-DATA-INTEGRITY",
  active_reset_id: runningReset.id
}, null, 2));
