import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const assemblyTool = resolve(repositoryRoot, "tools/assemble-g1-correction.mjs");
const recomputeBaselineTool = resolve(repositoryRoot, "tools/recompute-baseline-manifest.mjs");
const recomputeTool = resolve(repositoryRoot, "tools/recompute-g1-hashes.mjs");
const verifierTool = resolve(repositoryRoot, "tools/verify-g1-assembly.mjs");
const candidateRootTool = resolve(repositoryRoot, "tools/g1-candidate-root.mjs");
const candidateRootPath = "baseline/candidates/demo-r1-v2.1.4-g1-correction-integrity-root-v3.yaml";

function copyRepository(): string {
  const target = mkdtempSync(join(tmpdir(), "fotc-g1-mutation-"));
  const checksums = readFileSync(join(repositoryRoot, "SHA256SUMS.txt"), "utf8");
  const requiredFiles = new Set([
    "SHA256SUMS.txt",
    "baseline/demo-r1-baseline-manifest.yaml",
    "baseline/demo-r1-g1-correction-integrity-root.schema.json",
    candidateRootPath
  ]);
  for (const line of checksums.trim().split(/\r?\n/)) {
    const [, path] = line.split(/\s{2}/);
    if (path) requiredFiles.add(path);
  }
  const baseline = parse(readFileSync(join(repositoryRoot, "baseline/demo-r1-baseline-manifest.yaml"), "utf8"));
  for (const artifact of baseline.artifacts as Array<{ path: string }>) requiredFiles.add(artifact.path);
  const candidate = parse(readFileSync(join(repositoryRoot, candidateRootPath), "utf8"));
  for (const artifact of candidate.protected_artifacts as Array<{ path: string }>) requiredFiles.add(artifact.path);
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

function verifyCandidate(root: string) {
  return spawnSync(process.execPath, [candidateRootTool, "verify"], {
    cwd: root,
    encoding: "utf8"
  });
}

function candidateDigest(root: string): string {
  return createHash("sha256").update(readFileSync(join(root, candidateRootPath))).digest("hex");
}

function appendMutation(root: string, path: string): void {
  const target = join(root, path);
  writeFileSync(target, `${readFileSync(target, "utf8")}\nCANDIDATE_ROOT_MUTATION\n`);
}

function changeApiResetVersion(root: string): void {
  const resolvedPath = join(root, "tests/spec/demo-r1-resolved-seeds.json");
  const resolved = JSON.parse(readFileSync(resolvedPath, "utf8"));
  resolved.fixtures["FX-API-RESET"].tables.demo_runtime_control[0].version = 8;
  writeFileSync(resolvedPath, `${JSON.stringify(resolved, null, 2)}\n`);
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

  it("rejects R8-MUT-003 after assembly and full hash recomputation", () => {
    const mutatedRoot = copyRepository();
    try {
      changeApiResetVersion(mutatedRoot);
      const assembly = spawnSync(process.execPath, [assemblyTool], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(assembly.status, assembly.stderr || assembly.stdout).toBe(0);
      const recompute = spawnSync(process.execPath, [recomputeTool], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(recompute.status, recompute.stderr || recompute.stdout).toBe(0);

      const verification = verifyCandidate(mutatedRoot);
      expect(verification.status, "R8-MUT-003 must be rejected against the frozen candidate").not.toBe(0);
      expect(`${verification.stdout}\n${verification.stderr}`).toContain("CANDIDATE_ROOT_MISMATCH:");
    } finally {
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps every candidate-root byte unchanged across assembly and recomposition", () => {
    const mutatedRoot = copyRepository();
    try {
      const before = candidateDigest(mutatedRoot);
      const assembly = spawnSync(process.execPath, [assemblyTool], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(assembly.status, assembly.stderr || assembly.stdout).toBe(0);
      const recompute = spawnSync(process.execPath, [recomputeTool], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(recompute.status, recompute.stderr || recompute.stdout).toBe(0);
      const recomputeBaseline = spawnSync(process.execPath, [recomputeBaselineTool], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(recomputeBaseline.status, recomputeBaseline.stderr || recomputeBaseline.stdout).toBe(0);
      expect(candidateDigest(mutatedRoot)).toBe(before);
      const verification = verify(mutatedRoot);
      expect(verification.status, verification.stderr || verification.stdout).toBe(0);
      expect(verification.stdout).toContain("PASS_CANDIDATE_MATCH_PENDING_RATIFICATION");
    } finally {
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it.each([
    ["normative fixture", "tests/spec/demo-r1-resolved-seeds.json"],
    ["G1 executable behavior", "apps/api/src/demo/demo.service.ts"],
    ["G1 migration", "packages/database/prisma/migrations/202608020001_g1_foundation/migration.sql"],
    ["runtime runner", "tests/runtime/g1-contract-runner.mts"],
    ["assembly verifier", "tools/verify-g1-assembly.mjs"],
    ["package scripts", "package.json"],
    ["dependency lock", "pnpm-lock.yaml"],
    ["R8 report", "reviews/history/45-demo-r1-v2.1.4-final-independent-review.md"],
    ["R8 evidence", "reviews/history/demo-r1-v2.1.4-final-independent-review-evidence.json"]
  ])("rejects an independent mutation of %s", (_label, path) => {
    const mutatedRoot = copyRepository();
    try {
      appendMutation(mutatedRoot, path);
      const verification = verifyCandidate(mutatedRoot);
      expect(verification.status, `${path} mutation must be rejected`).not.toBe(0);
      expect(`${verification.stdout}\n${verification.stderr}`).toContain(`CANDIDATE_ROOT_MISMATCH: ${path}`);
    } finally {
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuses to overwrite an existing candidate revision", () => {
    const mutatedRoot = copyRepository();
    try {
      const creation = spawnSync(process.execPath, [candidateRootTool, "create"], {
        cwd: mutatedRoot,
        encoding: "utf8"
      });
      expect(creation.status).not.toBe(0);
      expect(`${creation.stdout}\n${creation.stderr}`).toContain("CANDIDATE_ROOT_ALREADY_EXISTS");
    } finally {
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  });

  it("does not simulate ratification validation", () => {
    const result = spawnSync(process.execPath, [candidateRootTool, "verify", "--require-ratified"], {
      cwd: repositoryRoot,
      encoding: "utf8"
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("RATIFICATION_VALIDATION_UNAVAILABLE");
  });
});
