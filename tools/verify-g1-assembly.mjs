import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const root = process.cwd();
const read = (path) => readFileSync(`${root}/${path}`);
const text = (path) => read(path).toString("utf8");
const json = (path) => JSON.parse(text(path));
const sha256 = (path) => createHash("sha256").update(read(path)).digest("hex");
const sorted = (value) => Array.isArray(value)
  ? value.map(sorted)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]))
    : value;
const stateHash = (tables) => createHash("sha256").update(JSON.stringify(sorted(tables))).digest("hex");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const schemaPairs = [
  ["tests/spec/demo-r1-resolved-seeds.json", "tests/spec/demo-r1-resolved-seeds.schema.json", "json"],
  ["tests/spec/demo-r1-test-catalog.yaml", "tests/spec/demo-r1-test-catalog.schema.json", "yaml"],
  ["tests/spec/demo-r1-test-runner-programs.yaml", "tests/spec/demo-r1-test-runner-programs.schema.json", "yaml"],
  ["tests/spec/demo-r1-seed-manifest.yaml", "tests/spec/demo-r1-seed-manifest.schema.json", "yaml"],
  ["tests/spec/demo-r1-seed-layers.yaml", "tests/spec/demo-r1-seed-layers.schema.json", "yaml"],
  ["tests/spec/demo-r1-test-fixtures.yaml", "tests/spec/demo-r1-test-fixtures.schema.json", "yaml"]
];
for (const [artifact, schemaPath, format] of schemaPairs) {
  const validate = ajv.compile(json(schemaPath));
  const value = format === "json" ? json(artifact) : parse(text(artifact));
  invariant(validate(value), `${artifact} violates ${schemaPath}: ${ajv.errorsText(validate.errors)}`);
}

const catalog = parse(text("tests/spec/demo-r1-test-catalog.yaml"));
const resolved = json("tests/spec/demo-r1-resolved-seeds.json");
const seedManifest = parse(text("tests/spec/demo-r1-seed-manifest.yaml"));
const fixtureSnapshots = parse(text("tests/spec/demo-r1-test-fixtures.yaml"));
const seedLayers = parse(text("tests/spec/demo-r1-seed-layers.yaml"));
const testsById = new Map(catalog.tests.map((test) => [test.id, test]));
const expectedUsage = new Map(Object.keys(resolved.fixtures).map((fixtureId) => [fixtureId, []]));
for (const test of catalog.tests) {
  invariant(expectedUsage.has(test.fixture), `${test.id} references unknown primary fixture ${test.fixture}`);
  expectedUsage.get(test.fixture).push(test.id);
}
invariant(JSON.stringify(Object.keys(seedManifest.fixtures).sort()) === JSON.stringify(Object.keys(resolved.fixtures).sort()), "seed manifest fixture keys differ from resolved seed");
for (const [fixtureId, fixture] of Object.entries(resolved.fixtures)) {
  const expected = expectedUsage.get(fixtureId).sort();
  const actual = [...fixture.used_by_test_ids].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${fixtureId}.used_by_test_ids differs from catalog`);
  const manifestFixture = seedManifest.fixtures[fixtureId];
  invariant(JSON.stringify([...manifestFixture.used_by_test_ids].sort()) === JSON.stringify(expected), `${fixtureId}.used_by_test_ids differs in seed manifest`);
  invariant(manifestFixture.used_by_test_ids.every((testId) => testsById.has(testId)), `${fixtureId}.seed manifest references unknown test id`);
  invariant(manifestFixture.state_sha256 === fixture.state_sha256, `${fixtureId} state hash differs in seed manifest`);
  invariant(fixture.state_sha256 === stateHash(fixture.tables), `${fixtureId} state_sha256 is not reproducible`);
}
for (const [fixtureId, fixtureReference] of Object.entries({ ...fixtureSnapshots.snapshots, ...fixtureSnapshots.seed_aliases })) {
  invariant(resolved.fixtures[fixtureId], `${fixtureId} fixture reference has no resolved seed`);
  invariant(fixtureReference.state_sha256 === resolved.fixtures[fixtureId].state_sha256, `${fixtureId} state hash differs in fixture references`);
}
for (const fixtureId of Object.keys(resolved.fixtures)) {
  const fixtureReference = fixtureSnapshots.snapshots[fixtureId] ?? fixtureSnapshots.seed_aliases[fixtureId];
  invariant(fixtureReference, `${fixtureId} has no fixture snapshot or seed alias`);
}

const validateLayer = ajv.compile(json("tests/spec/demo-r1-layered-resolved-seed.schema.json"));
for (const layerSpec of Object.values(seedLayers.gates)) {
  const layerPath = layerSpec.bundle_file;
  const layer = json(layerPath);
  invariant(validateLayer(layer), `${layerPath} violates layered seed schema: ${ajv.errorsText(validateLayer.errors)}`);
  invariant(sha256(layerPath) === layerSpec.bundle_sha256, `${layerPath} hash differs from seed layer plan`);
  for (const [fixtureId, fixture] of Object.entries(layer.fixtures)) {
    invariant(resolved.fixtures[fixtureId], `${layerPath} references unknown fixture ${fixtureId}`);
    invariant(JSON.stringify(fixture.used_by_test_ids) === JSON.stringify(resolved.fixtures[fixtureId].used_by_test_ids), `${layerPath} ${fixtureId}.used_by_test_ids differs from resolved seed`);
    invariant(JSON.stringify(fixture.used_by_test_ids) === JSON.stringify(seedManifest.fixtures[fixtureId].used_by_test_ids), `${layerPath} ${fixtureId}.used_by_test_ids differs from seed manifest`);
    invariant(fixture.full_state_sha256 === resolved.fixtures[fixtureId].state_sha256, `${layerPath} ${fixtureId}.full_state_sha256 differs from resolved seed`);
    invariant(fixture.layer_state_sha256 === stateHash(fixture.tables), `${layerPath} ${fixtureId}.layer_state_sha256 is not reproducible`);
  }
}

const docs = {
  "docs/22-demo-r1-traceability-and-test-matrix.md": [
    "traceability/demo-r1-traceability.yaml",
    "traceability/demo-r1-test-reverse-traceability.csv"
  ],
  "docs/25-demo-r1-executable-test-catalog.md": [
    "tests/spec/demo-r1-test-catalog.yaml",
    "tests/spec/demo-r1-test-runner-programs.yaml"
  ],
  "docs/28-demo-r1-seed-manifest.md": [
    "tests/spec/demo-r1-seed-manifest.yaml",
    "tests/spec/demo-r1-resolved-seeds.json",
    "tests/spec/demo-r1-test-fixtures.yaml",
    "tests/spec/demo-r1-table-contract.yaml",
    "tests/spec/demo-r1-seed-layers.yaml",
    "tests/spec/seed-layers/g1-foundation.json"
  ],
  "docs/29-demo-r1-test-runner-contract.md": [
    "tests/spec/demo-r1-test-runner-programs.yaml",
    "tests/spec/demo-r1-seed-layers.yaml"
  ]
};
for (const [doc, artifacts] of Object.entries(docs)) {
  const source = text(doc);
  for (const artifact of artifacts) invariant(source.includes(sha256(artifact)), `${doc} does not contain current hash for ${artifact}`);
}

const baseline = parse(text("baseline/demo-r1-baseline-manifest.yaml"));
for (const artifact of baseline.artifacts) {
  invariant(sha256(artifact.path) === artifact.sha256, `baseline hash differs for ${artifact.path}`);
  invariant(read(artifact.path).length === artifact.size_bytes, `baseline size differs for ${artifact.path}`);
}
for (const line of text("SHA256SUMS.txt").trim().split(/\r?\n/)) {
  const [expected, path] = line.split(/\s{2}/);
  invariant(Boolean(expected && path), `invalid SHA256SUMS line: ${line}`);
  invariant(sha256(path) === expected, `SHA256SUMS differs for ${path}`);
}

console.log(JSON.stringify({ status: "PASS", schemas: schemaPairs.length + 6, fixtures: resolved.fixture_count, baseline_artifacts: baseline.artifacts.length, checksum_entries: text("SHA256SUMS.txt").trim().split(/\r?\n/).length }));
