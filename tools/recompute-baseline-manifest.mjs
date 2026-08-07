import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = "baseline/demo-r1-baseline-manifest.yaml";
let source = readFileSync(path, "utf8");
const entryPattern = /(- path: ([^\r\n]+)\r?\n  role: [^\r\n]+\r?\n  sha256: )[a-f0-9]+(\r?\n  size_bytes: )\d+/g;
let updated = 0;
source = source.replace(entryPattern, (full, prefix, artifactPath, suffix) => {
  if (!existsSync(artifactPath)) return full;
  const bytes = readFileSync(artifactPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  updated += 1;
  return `${prefix}${digest}${suffix}${bytes.length}`;
});
writeFileSync(path, source);
console.log(`Recomputed ${updated} manifested artifact hashes and sizes.`);
