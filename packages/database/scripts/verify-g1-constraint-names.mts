import { Client } from "pg";

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://fleet_demo:fleet_demo@localhost:5432/fleet_demo"
});

await client.connect();

try {
  const { rows: constraints } = await client.query<{
    name: string;
    table_name: string;
    schema_name: string;
    type: string;
    definition: string;
  }>(`
    SELECT c.conname AS name,
           n.nspname AS schema_name,
           rel.relname AS table_name,
           c.contype AS type,
           pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE c.conname IN ('pk_user_role', 'fk_user_customer_scope_customer')
     ORDER BY c.conname
  `);

  const { rows: indexes } = await client.query<{
    name: string;
    table_name: string;
    schema_name: string;
    is_unique: boolean;
    predicate: string | null;
  }>(`
    SELECT idx.relname AS name,
           table_rel.relname AS table_name,
           schema_ns.nspname AS schema_name,
           i.indisunique AS is_unique,
           pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class table_rel ON table_rel.oid = i.indrelid
      JOIN pg_namespace schema_ns ON schema_ns.oid = table_rel.relnamespace
     WHERE idx.relname = 'uq_demo_reset_running'
  `);

  const pk = constraints.find((row) => row.name === "pk_user_role");
  const fk = constraints.find((row) => row.name === "fk_user_customer_scope_customer");
  const activeIndex = indexes[0];
  const errors: string[] = [];

  if (!pk || pk.schema_name !== "public" || pk.table_name !== "user_role" || pk.type !== "p" || pk.definition !== "PRIMARY KEY (user_id)") {
    errors.push(`pk_user_role has unexpected definition: ${JSON.stringify(pk)}`);
  }
  if (!fk || fk.schema_name !== "public" || fk.table_name !== "user_customer_scope" || fk.type !== "f" || !/^FOREIGN KEY \(customer_id\) REFERENCES customer\(id\)/.test(fk.definition)) {
    errors.push(`fk_user_customer_scope_customer has unexpected definition: ${JSON.stringify(fk)}`);
  }
  if (!activeIndex || activeIndex.schema_name !== "public" || activeIndex.table_name !== "demo_reset_execution" || !activeIndex.is_unique || !activeIndex.predicate || !["REQUESTED", "RUNNING", "RECOVERING"].every((state) => activeIndex.predicate.includes(state))) {
    errors.push(`uq_demo_reset_running has unexpected definition: ${JSON.stringify(activeIndex)}`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));

  console.log("Verified G1 constraint names and definitions: pk_user_role, fk_user_customer_scope_customer, uq_demo_reset_running");
} finally {
  await client.end();
}
