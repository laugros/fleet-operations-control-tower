ALTER TABLE "user_role"
  RENAME CONSTRAINT "user_role_pkey" TO "pk_user_role";

ALTER TABLE "user_customer_scope"
  RENAME CONSTRAINT "user_customer_scope_customer_id_fkey"
  TO "fk_user_customer_scope_customer";

ALTER INDEX "uq_demo_reset_active"
  RENAME TO "uq_demo_reset_running";
