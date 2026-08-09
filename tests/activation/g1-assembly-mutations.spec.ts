import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

const repositoryRoot = process.cwd();
const recomputeTool = resolve(repositoryRoot, "tools/recompute-g1-hashes.mjs");
const verifierTool = resolve(repositoryRoot, "tools/verify-g1-assembly.mjs");

function copyRepository(): string {
  const target = mkdtempSync(join(tmpdir(), "fotc-g1-mutation-"));
  const checksums = readFileSync(join(repositoryRoot, "SHA256SUMS.txt"), "utf8");
  const requiredFiles = new Set([
    "SHA256SUMS.txt",
    "baseline/demo-r1-baseline-manifest.yaml"
  ]);
  for (const line of checksums.trim().split(/\r?\n/)) {
    const [, path] = line.split(/\s{2}/);
    if (path) requiredFiles.add(path);
  }
  const baseline = parse(readFileSync(join(repositoryRoot, "baseline/demo-r1-baseline-manifest.yaml"), "utf8"));
  for (const artifact of baseline.artifacts as Array<{ path: string }>) requiredFiles.add(artifact.path);
  for (const path of requiredFiles) {
    const destination = join(target, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(repositoryRoot, path), destination);
  }
  return target;
}

function reverseApiResetUsage(root: string): void {
  const resolvedPath = join(root, "tests/spec/demo-r1-resolved-seeds.json");
  const resolved = JSON.parse(readFileSync(resolvedPath, "utf8"));
  resolved.fixtures["FX-API-RESET"].used_by_test_ids.reverse();
  writeFileSync(resolvedPath, `${JSON.stringify(resolved, null, 2)}\n`);

  const manifestPath = join(root, "tests/spec/demo-r1-seed-manifest.yaml");
  const manifest = parse(readFileSync(manifestPath, "utf8"));
  manifest.fixtures["FX-API-RESET"].used_by_test_ids.reverse();
  writeFileSync(manifestPath, stringify(manifest, { lineWidth: 0 }));

  for (const bundle of [
    "g1-foundation.json",
    "g2-domain.json",
    "g3-projections.json",
    "g4-time-communication.json",
    "g5-external.json",
    "g6-executive.json"
  ]) {
    const bundlePath = join(root, "tests/spec/seed-layers", bundle);
    const layer = JSON.parse(readFileSync(bundlePath, "utf8"));
    layer.fixtures["FX-API-RESET"].used_by_test_ids.reverse();
    writeFileSync(bundlePath, `${JSON.stringify(layer, null, 2)}\n`);
  }
}

function verify(root: string) {
  return spawnSync(process.execPath, [verifierTool], {
    cwd: root,
    encoding: "utf8"
  });
}

describe("G1 assembly mutation rejection", () => {
  it("rejects R8-MUT-002 when only used_by_test_ids order is reversed everywhere", () => {
    const mutatedRoot = copyRepository();
    try {
      reverseApiResetUsage(mutatedRoot);
      const recompute = spawnSync(process.execPath, [recomputeTool], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(recompute.status, recompute.stderr || recompute.stdout).toBe(0);

      const verification = verify(mutatedRoot);
      expect(
        verification.status,
        "R8-MUT-002 must be rejected after a self-consistent hash recomputation"
      ).not.toBe(0);
      expect(`${verification.stdout}\n${verification.stderr}`).toContain(
        "FX-API-RESET.used_by_test_ids differs from canonical catalog order"
      );
    } finally {
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects missing, additional, unknown and duplicate fixture usages", () => {
    const mutatedRoot = copyRepository();
    const resolvedPath = join(mutatedRoot, "tests/spec/demo-r1-resolved-seeds.json");
    const original = readFileSync(resolvedPath, "utf8");
    const cases: Array<[string, string, (usage: string[]) => void]> = [
      ["missing", "differs from canonical catalog order", (usage) => { usage.pop(); }],
      ["additional", "differs from canonical catalog order", (usage) => { usage.push("TST-DEMO-SEED-001"); }],
      ["unknown", "differs from canonical catalog order", (usage) => { usage.push("TST-UNKNOWN-999"); }],
      ["duplicate", "must NOT have duplicate items", (usage) => { usage.push(usage[0]); }]
    ];
    try {
      for (const [name, expectedError, mutate] of cases) {
        const resolved = JSON.parse(original);
        mutate(resolved.fixtures["FX-API-RESET"].used_by_test_ids);
        writeFileSync(resolvedPath, `${JSON.stringify(resolved, null, 2)}\n`);
        const verification = verify(mutatedRoot);
        expect(verification.status, `${name} usage must be rejected`).not.toBe(0);
        expect(`${verification.stdout}\n${verification.stderr}`).toContain(expectedError);
      }
    } finally {
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
