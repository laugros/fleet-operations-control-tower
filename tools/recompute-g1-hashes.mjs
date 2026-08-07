import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parse, stringify } from "yaml";

const root = process.cwd();
const bytes = (path) => readFileSync(`${root}/${path}`);
const digest = (path) => createHash("sha256").update(bytes(path)).digest("hex");

const layerPlanPath = "tests/spec/demo-r1-seed-layers.yaml";
const layerPlan = parse(bytes(layerPlanPath).toString("utf8"));
for (const gate of Object.values(layerPlan.gates)) gate.bundle_sha256 = digest(gate.bundle_file);
writeFileSync(`${root}/${layerPlanPath}`, stringify(layerPlan, { lineWidth: 0 }));

const docHashes = {
  "docs/22-demo-r1-traceability-and-test-matrix.md": {
    "SHA-256 do registry": "traceability/demo-r1-traceability.yaml",
    "SHA-256 do índice reverso": "traceability/demo-r1-test-reverse-traceability.csv"
  },
  "docs/25-demo-r1-executable-test-catalog.md": {
    "SHA-256 do catálogo": "tests/spec/demo-r1-test-catalog.yaml",
    "SHA-256 dos programas": "tests/spec/demo-r1-test-runner-programs.yaml"
  },
  "docs/28-demo-r1-seed-manifest.md": {
    "SHA-256 do manifest": "tests/spec/demo-r1-seed-manifest.yaml",
    "SHA-256 dos estados completos": "tests/spec/demo-r1-resolved-seeds.json",
    "SHA-256 das fixtures": "tests/spec/demo-r1-test-fixtures.yaml",
    "SHA-256 do contrato de tabelas": "tests/spec/demo-r1-table-contract.yaml",
    "SHA-256 do plano de camadas": layerPlanPath,
    "SHA-256 do bundle G1": "tests/spec/seed-layers/g1-foundation.json"
  },
  "docs/29-demo-r1-test-runner-contract.md": {
    "SHA-256 dos programas": "tests/spec/demo-r1-test-runner-programs.yaml",
    "SHA-256 do plano de seed": layerPlanPath
  }
};
for (const [doc, mappings] of Object.entries(docHashes)) {
  let source = bytes(doc).toString("utf8");
  for (const [label, artifact] of Object.entries(mappings)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    source = source.replace(new RegExp("(" + escaped + ":? `)[0-9a-f]{64}(`)"), `$1${digest(artifact)}$2`);
  }
  writeFileSync(`${root}/${doc}`, source);
}

const baselinePath = "baseline/demo-r1-baseline-manifest.yaml";
let baseline = bytes(baselinePath).toString("utf8");
const entryPattern = /(- path: ([^\r\n]+)\r?\n  role: [^\r\n]+\r?\n  sha256: )[a-f0-9]+(\r?\n  size_bytes: )\d+/g;
baseline = baseline.replace(entryPattern, (full, prefix, artifactPath, suffix) => {
  if (!existsSync(`${root}/${artifactPath}`)) return full;
  return `${prefix}${digest(artifactPath)}${suffix}${bytes(artifactPath).length}`;
});
writeFileSync(`${root}/${baselinePath}`, baseline);

const checksumsPath = "SHA256SUMS.txt";
const checksums = bytes(checksumsPath).toString("utf8").trim().split(/\r?\n/).map((line) => {
  const [, artifactPath] = line.split(/\s{2}/);
  if (!artifactPath || !existsSync(`${root}/${artifactPath}`)) throw new Error(`Invalid checksum entry: ${line}`);
  return `${digest(artifactPath)}  ${artifactPath}`;
});
writeFileSync(`${root}/${checksumsPath}`, `${checksums.join("\n")}\n`);

console.log(`Recomputed ${Object.keys(layerPlan.gates).length} bundles, documentation hashes, baseline manifest and ${checksums.length} checksum entries.`);
