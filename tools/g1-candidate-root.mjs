import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";

export const CANDIDATE_ROOT_PATH = "baseline/candidates/demo-r1-v2.1.4-g1-correction-integrity-root-v3.yaml";
export const CANDIDATE_ROOT_SCHEMA_PATH = "baseline/demo-r1-g1-correction-integrity-root.schema.json";

const protectedArtifacts = [
  [".env.example", "CONFIGURATION"],
  ["README.md", "DOCUMENTATION"],
  ["apps/api/src/demo/demo.service.ts", "G1_FUNCTIONAL"],
  [CANDIDATE_ROOT_SCHEMA_PATH, "ROOT_SCHEMA"],
  ["docs/22-demo-r1-traceability-and-test-matrix.md", "NORMATIVE_DOCUMENT"],
  ["docs/25-demo-r1-executable-test-catalog.md", "NORMATIVE_DOCUMENT"],
  ["docs/28-demo-r1-seed-manifest.md", "NORMATIVE_DOCUMENT"],
  ["docs/29-demo-r1-test-runner-contract.md", "NORMATIVE_DOCUMENT"],
  ["implementation/evidence/g1-candidate-integrity-root.md", "PROCEDURE"],
  ["package.json", "CONFIGURATION"],
  ["packages/database/prisma/migrations/202608020001_g1_foundation/migration.sql", "DATABASE"],
  ["packages/database/prisma/migrations/202608040001_g1_contract_constraint_names/migration.sql", "DATABASE"],
  ["packages/database/scripts/verify-g1-constraint-names.mts", "DATABASE"],
  ["pnpm-lock.yaml", "CONFIGURATION"],
  ["reviews/history/44-demo-r1-v2.1.4-g1-contract-corrections.md", "EVIDENCE"],
  ["reviews/history/45-demo-r1-v2.1.4-final-independent-review.md", "EVIDENCE"],
  ["reviews/history/demo-r1-v2.1.4-final-independent-review-evidence.json", "EVIDENCE"],
  ["reviews/history/demo-r1-v2.1.4-g1-contract-correction-evidence.json", "EVIDENCE"],
  ["tests/activation/g1-assembly-mutations.spec.ts", "TEST"],
  ["tests/activation/g1-assertion-coverage.spec.ts", "TEST"],
  ["tests/activation/g1-foundation.spec.ts", "TEST"],
  ["tests/activation/g1-runner-evidence.spec.ts", "TEST"],
  ["tests/runtime/g1-assertion-coverage.mts", "RUNNER"],
  ["tests/runtime/g1-contract-runner.mts", "RUNNER"],
  ["tests/spec/demo-r1-resolved-seeds.json", "NORMATIVE_CONTRACT"],
  ["tests/spec/demo-r1-seed-layers.yaml", "NORMATIVE_CONTRACT"],
  ["tests/spec/demo-r1-seed-manifest.yaml", "NORMATIVE_CONTRACT"],
  ["tests/spec/demo-r1-test-catalog.yaml", "NORMATIVE_CONTRACT"],
  ["tests/spec/demo-r1-test-fixtures.yaml", "NORMATIVE_CONTRACT"],
  ["tests/spec/demo-r1-test-runner-programs.yaml", "NORMATIVE_CONTRACT"],
  ["tests/spec/seed-layers/g1-foundation.json", "NORMATIVE_CONTRACT"],
  ["tests/spec/seed-layers/g2-domain.json", "NORMATIVE_CONTRACT"],
  ["tests/spec/seed-layers/g3-projections.json", "NORMATIVE_CONTRACT"],
  ["tests/spec/seed-layers/g4-time-communication.json", "NORMATIVE_CONTRACT"],
  ["tests/spec/seed-layers/g5-external.json", "NORMATIVE_CONTRACT"],
  ["tests/spec/seed-layers/g6-executive.json", "NORMATIVE_CONTRACT"],
  ["tools/assemble-g1-correction.mjs", "INTEGRITY_TOOL"],
  ["tools/g1-candidate-root.mjs", "INTEGRITY_TOOL"],
  ["tools/recompute-baseline-manifest.mjs", "INTEGRITY_TOOL"],
  ["tools/recompute-g1-hashes.mjs", "INTEGRITY_TOOL"],
  ["tools/verify-g1-assembly.mjs", "INTEGRITY_TOOL"],
  ["traceability/demo-r1-test-reverse-traceability.csv", "NORMATIVE_CONTRACT"],
  ["traceability/demo-r1-traceability.yaml", "NORMATIVE_CONTRACT"]
];

export const PROTECTED_ARTIFACTS = protectedArtifacts
  .map(([path, role]) => ({ path, role }))
  .sort((a, b) => compareText(a.path, b.path));

export const POST_REVIEW_PATH_ALLOWLIST = [
  "SHA256SUMS.txt",
  "baseline/demo-r1-baseline-manifest.schema.json",
  "baseline/demo-r1-baseline-manifest.yaml",
  "baseline/demo-r1-implementation-authorization.schema.json",
  "baseline/demo-r1-implementation-authorization.yaml",
  "policies/demo-r1-implementation-authorization-policy.schema.json",
  "policies/demo-r1-implementation-authorization-policy.yaml",
  "reviews/demo-r1-v2.1.4-r9-integrity-root-decision.schema.json",
  "reviews/demo-r1-v2.1.4-r9-integrity-root-decision.yaml",
  "reviews/history/46-demo-r1-v2.1.4-r9-independent-review.md",
  "reviews/history/demo-r1-v2.1.4-r9-independent-review-evidence.json"
].sort(compareText);

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareText(a, b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function canonicalProtectedSet(protectedSet) {
  return JSON.stringify(canonicalize(protectedSet));
}

export function computeProtectedArtifacts(repositoryRoot = process.cwd()) {
  return PROTECTED_ARTIFACTS.map(({ path, role }) => {
    const absolutePath = resolve(repositoryRoot, path);
    invariant(existsSync(absolutePath), `CANDIDATE_ROOT_PROTECTED_FILE_MISSING: ${path}`);
    const bytes = readFileSync(absolutePath);
    return {
      path,
      role,
      sha256: sha256(bytes),
      size_bytes: statSync(absolutePath).size
    };
  });
}

export function computeProtectedSetSha256(protectedSet) {
  return sha256(Buffer.from(canonicalProtectedSet(protectedSet), "utf8"));
}

function validateRootSchema(document, repositoryRoot) {
  const schema = JSON.parse(readFileSync(resolve(repositoryRoot, CANDIDATE_ROOT_SCHEMA_PATH), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  invariant(validate(document), `CANDIDATE_ROOT_SCHEMA_INVALID: ${ajv.errorsText(validate.errors)}`);
}

function assertExactPaths(document) {
  const observed = document.protected_artifacts.map(({ path }) => path);
  const expected = PROTECTED_ARTIFACTS.map(({ path }) => path);
  invariant(JSON.stringify(observed) === JSON.stringify(expected), "CANDIDATE_ROOT_PROTECTED_PATH_SET_INVALID");
  invariant(
    JSON.stringify(document.post_review_path_allowlist) === JSON.stringify(POST_REVIEW_PATH_ALLOWLIST),
    "CANDIDATE_ROOT_POST_REVIEW_ALLOWLIST_INVALID"
  );
}

export function verifyCandidateRoot(repositoryRoot = process.cwd()) {
  const candidatePath = resolve(repositoryRoot, CANDIDATE_ROOT_PATH);
  invariant(existsSync(candidatePath), `CANDIDATE_ROOT_MISSING: ${CANDIDATE_ROOT_PATH}`);
  const candidateBytes = readFileSync(candidatePath);
  const document = parse(candidateBytes.toString("utf8"));
  validateRootSchema(document, repositoryRoot);
  assertExactPaths(document);

  const expectedRoles = new Map(PROTECTED_ARTIFACTS.map(({ path, role }) => [path, role]));
  for (const artifact of document.protected_artifacts) {
    invariant(artifact.role === expectedRoles.get(artifact.path), `CANDIDATE_ROOT_ROLE_MISMATCH: ${artifact.path}`);
  }

  const recomputed = computeProtectedArtifacts(repositoryRoot);
  const observedByPath = new Map(document.protected_artifacts.map((artifact) => [artifact.path, artifact]));
  for (const artifact of recomputed) {
    const expected = observedByPath.get(artifact.path);
    invariant(expected, `CANDIDATE_ROOT_PROTECTED_FILE_UNDECLARED: ${artifact.path}`);
    invariant(
      expected.sha256 === artifact.sha256 && expected.size_bytes === artifact.size_bytes,
      `CANDIDATE_ROOT_MISMATCH: ${artifact.path} expected=${expected.sha256}/${expected.size_bytes} actual=${artifact.sha256}/${artifact.size_bytes}`
    );
  }

  const recomputedSetSha256 = computeProtectedSetSha256(recomputed);
  invariant(
    document.protected_set_sha256 === recomputedSetSha256,
    `CANDIDATE_ROOT_PROTECTED_SET_MISMATCH: expected=${document.protected_set_sha256} actual=${recomputedSetSha256}`
  );

  return {
    status: "PASS_CANDIDATE_MATCH_PENDING_RATIFICATION",
    candidate_root_path: CANDIDATE_ROOT_PATH,
    candidate_root_sha256: sha256(candidateBytes),
    protected_set_sha256: recomputedSetSha256,
    protected_artifacts: recomputed.length,
    ratification: "PENDING_FINAL_REVIEW",
    merge_authorized: false,
    open_formal_blocker: "PR1-BLK-005"
  };
}

export function createCandidateRoot(repositoryRoot = process.cwd()) {
  const candidatePath = resolve(repositoryRoot, CANDIDATE_ROOT_PATH);
  invariant(!existsSync(candidatePath), `CANDIDATE_ROOT_ALREADY_EXISTS: ${CANDIDATE_ROOT_PATH}`);
  const artifacts = computeProtectedArtifacts(repositoryRoot);
  const document = {
    root_format_version: "1.0.0",
    candidate_revision: 3,
    release: "DEMO-R1",
    baseline_version: "2.1.4",
    status: "PENDING_FINAL_REVIEW",
    authority: {
      ratified: false,
      formal_decision_required: true,
      merge_authorized: false,
      authorizes_g2_to_g6: false,
      open_formal_blocker: "PR1-BLK-005"
    },
    integrity_protocol: {
      algorithm: "SHA-256",
      file_content_canonicalization: "RAW_BYTES",
      path_base: "REPOSITORY_ROOT",
      path_normalization: "POSIX_RELATIVE",
      entry_order: "LEXICOGRAPHIC_BY_PATH",
      protected_set_canonicalization: "JSON_SORTED_KEYS_UTF8_NO_WHITESPACE_ARRAYS_PRESERVED",
      self_reference: "FORBIDDEN"
    },
    protected_set_sha256: computeProtectedSetSha256(artifacts),
    post_review_path_allowlist: POST_REVIEW_PATH_ALLOWLIST,
    protected_artifacts: artifacts
  };
  validateRootSchema(document, repositoryRoot);
  mkdirSync(dirname(candidatePath), { recursive: true });
  writeFileSync(candidatePath, stringify(document, { lineWidth: 0 }), { encoding: "utf8", flag: "wx" });
  return verifyCandidateRoot(repositoryRoot);
}

function runCli() {
  const command = process.argv[2];
  if (process.argv.includes("--require-ratified")) {
    throw new Error("RATIFICATION_VALIDATION_UNAVAILABLE");
  }
  if (command === "create") {
    console.log(JSON.stringify({ action: "CREATE_EXCLUSIVE", ...createCandidateRoot() }));
    return;
  }
  if (command === "verify") {
    console.log(JSON.stringify(verifyCandidateRoot()));
    return;
  }
  throw new Error("Usage: node tools/g1-candidate-root.mjs <create|verify>");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
