import { Client } from "pg";

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://fleet_demo:fleet_demo@localhost:5432/fleet_demo"
});

await client.connect();

try {
  const { rows } = await client.query<{ name: string }>(`
    SELECT conname AS name
      FROM pg_constraint
     WHERE conname IN ('pk_user_role', 'fk_user_customer_scope_customer')
    UNION ALL
    SELECT indexname AS name
      FROM pg_indexes
     WHERE indexname = 'uq_demo_reset_running'
    ORDER BY name
  `);

  const actual = rows.map(({ name }) => name);
  const expected = [
    "fk_user_customer_scope_customer",
    "pk_user_role",
    "uq_demo_reset_running"
  ];

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `G1 constraint names differ: expected ${expected.join(", ")}; got ${actual.join(", ")}`
    );
  }

  console.log(`Verified G1 constraint names: ${actual.join(", ")}`);
} finally {
  await client.end();
}
