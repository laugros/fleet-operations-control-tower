import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const runner = readFileSync(
  resolve(process.cwd(), "tests/runtime/g1-contract-runner.mts"),
  "utf8"
);

describe("G1 runner evidence phase boundary", () => {
  it("excludes fixture preparation from the contract database diff", () => {
    const preparation = runner.indexOf('await restoreG1Fixture({ fixtureId });');
    const initialSnapshot = runner.indexOf("await snapshotDatabase();", preparation);
    const action = runner.indexOf("await work();", initialSnapshot);
    const finalSnapshot = runner.indexOf("await snapshotDatabase();", action);
    const diff = runner.indexOf("changedTables(before, after)", finalSnapshot);

    expect(preparation).toBeGreaterThan(-1);
    expect(initialSnapshot).toBeGreaterThan(preparation);
    expect(action).toBeGreaterThan(initialSnapshot);
    expect(finalSnapshot).toBeGreaterThan(action);
    expect(diff).toBeGreaterThan(finalSnapshot);
    expect(runner).toContain("attributed_to_contract_diff: false");
    expect(runner).toContain("excluded_from_contract_effects: true");
  });
});
