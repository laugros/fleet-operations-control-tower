import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  declaredAssertions,
  validateG1AssertionCoverage
} from "../runtime/g1-assertion-coverage.mts";

const root = process.cwd();
const catalog = parse(readFileSync(resolve(root, "tests/spec/demo-r1-test-catalog.yaml"), "utf8"));
const g1 = JSON.parse(readFileSync(resolve(root, "tests/spec/seed-layers/g1-foundation.json"), "utf8"));
const testsById = new Map(catalog.tests.map((test: Record<string, unknown>) => [test.id, test]));
const g1Tests = g1.required_test_ids.map((testId: string) => testsById.get(testId));

describe("G1 declared assertion coverage", () => {
  it("assigns one identifiable executor to every declared expectation and operationId", () => {
    expect(g1Tests).not.toContain(undefined);
    expect(validateG1AssertionCoverage(g1Tests)).toBe(133);
    for (const test of g1Tests) {
      for (const declaration of declaredAssertions(test)) {
        expect(declaration.executor).toBeTruthy();
      }
    }
  });
});
