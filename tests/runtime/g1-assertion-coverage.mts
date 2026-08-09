export type ContractRecord = Record<string, unknown>;

export interface DeclaredAssertion {
  path: string;
  expected: unknown;
  executor: string;
}

function flatten(value: unknown, path = "", output: Array<[string, unknown]> = []): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${path}[${index}]`, output));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, output);
    }
  } else {
    output.push([path, value]);
  }
  return output;
}

function executorFor(test: ContractRecord, path: string): string | null {
  const action = (test.action as ContractRecord | undefined) ?? {};
  if (path === "action.operation_id") return "openapi.operation-id";
  if (path === "expected.http_status") return "http.response-status";
  if (path === "expected.error_code") {
    return action.type === "DB_PROGRAM" ? "database.program-error" : "http.error-code";
  }
  if (path === "expected.response_assertions.conforms_to_openapi_operation") return "openapi.operation-id";
  if (path === "expected.response_assertions.response_schema_ref") return "openapi.response-schema";
  if (path === "expected.response_assertions.contains_x_correlation_id") return "http.correlation-header";
  if (path === "expected.response_assertions.contains_x_demo_generation_id") return "http.generation-header";
  if (path === "expected.response_assertions.health_live") return "environment.health-live";
  if (path === "expected.response_assertions.health_ready") return "environment.health-ready";
  if (path.startsWith("expected.security_assertions[")) return `security.${String(test.id)}.${path}`;
  if (path.startsWith("expected.states.")) return `state.${String(test.id)}.${path.slice("expected.states.".length)}`;
  if (path.startsWith("expected.database_assertions[")) return `database.${String(test.id)}.${path}`;
  if (path.startsWith("expected.audit_assertions[")) return `audit.${String(test.id)}.${path}`;
  if (path.startsWith("expected.no_state_changes[")) return "database.transaction-rollback";
  if (path.startsWith("expected.events[")) return "event.registry-and-schema";
  if (path === "expected.event_assertions.schema_version") return "event.schema-version";
  if (path === "expected.event_assertions.demo_generation_id") return "event.transactional-generation-guard";
  if (path === "expected.event_assertions.aggregate_sequence_equals_resulting_version") return "event.aggregate-sequence";
  return null;
}

export function declaredAssertions(test: ContractRecord): DeclaredAssertion[] {
  const declarations = flatten(test.expected).map(([path, expected]) => ({
    path: `expected.${path}`,
    expected,
    executor: executorFor(test, `expected.${path}`)
  }));
  const operationId = (test.action as ContractRecord | undefined)?.operation_id;
  if (typeof operationId === "string") {
    declarations.push({
      path: "action.operation_id",
      expected: operationId,
      executor: executorFor(test, "action.operation_id")
    });
  }
  const missing = declarations.filter((declaration) => !declaration.executor);
  if (missing.length > 0) {
    throw new Error(`${String(test.id)} has assertions without executors: ${missing.map((item) => item.path).join(", ")}`);
  }
  return declarations as DeclaredAssertion[];
}

export function validateG1AssertionCoverage(tests: ContractRecord[]): number {
  let declarations = 0;
  for (const test of tests) {
    const paths = declaredAssertions(test).map((item) => item.path);
    if (new Set(paths).size !== paths.length) {
      throw new Error(`${String(test.id)} has duplicate declared assertion paths`);
    }
    declarations += paths.length;
  }
  return declarations;
}
