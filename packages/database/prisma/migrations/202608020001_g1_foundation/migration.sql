CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "demo_seed_manifest" (
  "seed_version" TEXT PRIMARY KEY,
  "manifest_sha256" CHAR(64) NOT NULL,
  "is_active" BOOLEAN NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "demo_generation" (
  "id" UUID PRIMARY KEY,
  "seed_version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "activated_at" TIMESTAMPTZ(3),
  "retired_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "failure_code" TEXT,
  CONSTRAINT "ck_demo_generation_status" CHECK ("status" IN ('CREATED','ACTIVE','RETIRED','FAILED'))
);

CREATE TABLE "demo_reset_execution" (
  "id" UUID PRIMARY KEY,
  "requested_seed_version" TEXT NOT NULL,
  "source_generation_id" UUID NOT NULL,
  "target_generation_id" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "requested_by_user_id_snapshot" UUID,
  "requested_by_identity_code" TEXT NOT NULL,
  "requested_by_display_name" TEXT NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "database_reset_started_at" TIMESTAMPTZ(3),
  "database_reset_committed_at" TIMESTAMPTZ(3),
  "projections_rebuilt_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "failure_code" TEXT,
  "warning_codes" TEXT[] NOT NULL DEFAULT '{}',
  "lease_owner_instance_id" TEXT,
  "heartbeat_at" TIMESTAMPTZ(3),
  "lease_expires_at" TIMESTAMPTZ(3),
  "recovery_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_recovery_started_at" TIMESTAMPTZ(3),
  "recovered_by_instance_id" TEXT,
  CONSTRAINT "ck_demo_reset_status" CHECK ("status" IN ('REQUESTED','RUNNING','RECOVERING','COMPLETED','FAILED')),
  CONSTRAINT "ck_demo_reset_terminal" CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "failed_at" IS NULL)
    OR ("status" = 'FAILED' AND "failed_at" IS NOT NULL AND "failure_code" IS NOT NULL)
    OR ("status" IN ('REQUESTED','RUNNING','RECOVERING') AND "completed_at" IS NULL AND "failed_at" IS NULL)
  )
);
CREATE UNIQUE INDEX "uq_demo_reset_active" ON "demo_reset_execution" ((1))
  WHERE "status" IN ('REQUESTED','RUNNING','RECOVERING');

CREATE TABLE "demo_runtime_control" (
  "singleton_key" BOOLEAN PRIMARY KEY DEFAULT TRUE,
  "active_generation_id" UUID NOT NULL REFERENCES "demo_generation"("id"),
  "runtime_status" TEXT NOT NULL,
  "reset_execution_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ck_demo_runtime_singleton" CHECK ("singleton_key"),
  CONSTRAINT "ck_demo_runtime_status" CHECK ("runtime_status" IN ('ACTIVE','RESETTING','FAILED_SAFE')),
  CONSTRAINT "ck_demo_runtime_version" CHECK ("version" > 0)
);

CREATE TABLE "demo_clock" (
  "id" UUID PRIMARY KEY,
  "current_time" TIMESTAMPTZ(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "demo_mode" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ck_demo_clock_version" CHECK ("version" > 0)
);

CREATE TABLE "operating_unit" (
  "id" UUID PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "display_name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL, "demo_seed_key" TEXT NOT NULL UNIQUE
);
CREATE TABLE "customer" (
  "id" UUID PRIMARY KEY, "customer_number" TEXT NOT NULL UNIQUE, "display_name" TEXT NOT NULL,
  "operating_unit_id" UUID NOT NULL REFERENCES "operating_unit"("id"), "is_active" BOOLEAN NOT NULL,
  "demo_seed_key" TEXT NOT NULL UNIQUE
);
CREATE INDEX "ix_customer_operating_unit" ON "customer"("operating_unit_id");
CREATE TABLE "team" (
  "id" UUID PRIMARY KEY, "operating_unit_id" UUID NOT NULL REFERENCES "operating_unit"("id"),
  "code" TEXT NOT NULL, "display_name" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL,
  "demo_seed_key" TEXT NOT NULL UNIQUE, UNIQUE ("operating_unit_id", "code")
);
CREATE TABLE "role" (
  "id" UUID PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "display_name" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL
);
CREATE TABLE "permission" (
  "id" UUID PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL
);
CREATE TABLE "app_user" (
  "id" UUID PRIMARY KEY, "identity_code" TEXT NOT NULL UNIQUE, "display_name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE, "is_active" BOOLEAN NOT NULL, "demo_seed_key" TEXT NOT NULL UNIQUE,
  CONSTRAINT "ck_app_user_demo_email" CHECK ("email" LIKE '%@%.invalid')
);
CREATE TABLE "role_permission" (
  "role_id" UUID NOT NULL REFERENCES "role"("id") ON DELETE CASCADE,
  "permission_id" UUID NOT NULL REFERENCES "permission"("id") ON DELETE CASCADE,
  PRIMARY KEY ("role_id", "permission_id")
);
CREATE TABLE "user_role" (
  "user_id" UUID PRIMARY KEY REFERENCES "app_user"("id") ON DELETE CASCADE,
  "role_id" UUID NOT NULL REFERENCES "role"("id")
);
CREATE INDEX "ix_user_role_role" ON "user_role"("role_id");
CREATE TABLE "team_member" (
  "team_id" UUID NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "is_active" BOOLEAN NOT NULL, PRIMARY KEY ("team_id", "user_id")
);
CREATE TABLE "user_operating_unit_scope" (
  "user_id" UUID NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "operating_unit_id" UUID NOT NULL REFERENCES "operating_unit"("id") ON DELETE CASCADE,
  PRIMARY KEY ("user_id", "operating_unit_id")
);
CREATE TABLE "user_customer_scope" (
  "user_id" UUID NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "customer_id" UUID NOT NULL REFERENCES "customer"("id") ON DELETE CASCADE,
  PRIMARY KEY ("user_id", "customer_id")
);

CREATE TABLE "supplier" (
  "id" UUID PRIMARY KEY, "supplier_number" TEXT NOT NULL UNIQUE, "display_name" TEXT NOT NULL,
  "email" TEXT NOT NULL, "phone" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL, "demo_seed_key" TEXT NOT NULL UNIQUE,
  CONSTRAINT "ck_supplier_demo_email" CHECK ("email" LIKE '%@%.invalid'),
  CONSTRAINT "ck_supplier_demo_phone" CHECK ("phone" LIKE '+55000000%')
);
CREATE TABLE "supplier_site" (
  "id" UUID PRIMARY KEY, "supplier_id" UUID NOT NULL REFERENCES "supplier"("id"), "site_code" TEXT NOT NULL,
  "display_name" TEXT NOT NULL, "timezone" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL,
  "demo_seed_key" TEXT NOT NULL UNIQUE, UNIQUE ("supplier_id", "site_code")
);
CREATE TABLE "driver" (
  "id" UUID PRIMARY KEY, "driver_number" TEXT NOT NULL UNIQUE, "display_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL, "demo_seed_key" TEXT NOT NULL UNIQUE,
  CONSTRAINT "ck_driver_demo_phone" CHECK ("phone" LIKE '+55000000%')
);
CREATE TABLE "vehicle" (
  "id" UUID PRIMARY KEY, "vehicle_number" TEXT NOT NULL UNIQUE,
  "customer_id" UUID NOT NULL REFERENCES "customer"("id"), "model_name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL, "demo_seed_key" TEXT NOT NULL UNIQUE
);
CREATE TABLE "vehicle_registration" (
  "id" UUID PRIMARY KEY, "vehicle_id" UUID NOT NULL REFERENCES "vehicle"("id"), "plate" TEXT NOT NULL,
  "valid_from" DATE NOT NULL, "valid_to" DATE, "is_current" BOOLEAN NOT NULL,
  CONSTRAINT "ck_vehicle_registration_dates" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
CREATE UNIQUE INDEX "uq_vehicle_registration_current" ON "vehicle_registration"("vehicle_id") WHERE "is_current";

CREATE TABLE "case_record" (
  "id" UUID PRIMARY KEY, "case_number" TEXT NOT NULL UNIQUE,
  "operating_unit_id" UUID NOT NULL REFERENCES "operating_unit"("id"),
  "customer_id" UUID NOT NULL REFERENCES "customer"("id"), "subject" TEXT NOT NULL, "description" TEXT NOT NULL,
  "status" TEXT NOT NULL, "assigned_team_id" UUID REFERENCES "team"("id"),
  "assigned_user_id" UUID REFERENCES "app_user"("id"), "started_at" TIMESTAMPTZ(3),
  "waiting_supplier_id" UUID REFERENCES "supplier"("id"), "waiting_action_code" TEXT,
  "waiting_expected_by" TIMESTAMPTZ(3), "waiting_reason_code" TEXT, "waiting_reason_text" TEXT,
  "resolution_code" TEXT, "resolution_summary" TEXT, "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "demo_seed_key" TEXT NOT NULL UNIQUE,
  CONSTRAINT "ck_case_status" CHECK ("status" IN ('NEW','IN_PROGRESS','WAITING_SUPPLIER','RESOLVED')),
  CONSTRAINT "ck_case_version" CHECK ("version" > 0),
  CONSTRAINT "ck_case_resolved" CHECK ("status" <> 'RESOLVED' OR ("resolved_at" IS NOT NULL AND "resolution_code" IS NOT NULL AND "resolution_summary" IS NOT NULL))
);

CREATE TABLE "vehicle_stop" (
  "id" UUID PRIMARY KEY, "stop_number" TEXT NOT NULL UNIQUE,
  "primary_case_id" UUID NOT NULL UNIQUE REFERENCES "case_record"("id"),
  "operating_unit_id" UUID NOT NULL REFERENCES "operating_unit"("id"),
  "customer_id" UUID NOT NULL REFERENCES "customer"("id"),
  "vehicle_id" UUID NOT NULL REFERENCES "vehicle"("id"), "supplier_site_id" UUID REFERENCES "supplier_site"("id"),
  "driver_id" UUID REFERENCES "driver"("id"), "assigned_team_id" UUID REFERENCES "team"("id"),
  "assigned_user_id" UUID REFERENCES "app_user"("id"), "status" TEXT NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3), "confirmed_arrival_at" TIMESTAMPTZ(3),
  "service_started_at" TIMESTAMPTZ(3), "current_forecast_at" TIMESTAMPTZ(3),
  "service_completed_at" TIMESTAMPTZ(3), "service_completion_summary" TEXT,
  "vehicle_released_at" TIMESTAMPTZ(3), "confirmed_departure_at" TIMESTAMPTZ(3),
  "stopped_duration_seconds" INTEGER, "last_relevant_event_at" TIMESTAMPTZ(3),
  "closed_at" TIMESTAMPTZ(3), "closure_reason" TEXT, "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "demo_seed_key" TEXT NOT NULL UNIQUE,
  CONSTRAINT "ck_vehicle_stop_status" CHECK ("status" IN ('PLANNED','AWAITING_ARRIVAL','AT_SUPPLIER','IN_EXECUTION','SERVICE_COMPLETED','VEHICLE_RELEASED','VEHICLE_PICKED_UP','CLOSED','CANCELLED')),
  CONSTRAINT "ck_vehicle_stop_version" CHECK ("version" > 0),
  CONSTRAINT "ck_vehicle_stop_duration" CHECK ("stopped_duration_seconds" IS NULL OR "stopped_duration_seconds" >= 0),
  CONSTRAINT "ck_vehicle_stop_release_order" CHECK ("vehicle_released_at" IS NULL OR ("service_completed_at" IS NOT NULL AND "vehicle_released_at" >= "service_completed_at")),
  CONSTRAINT "ck_vehicle_stop_departure_order" CHECK ("confirmed_departure_at" IS NULL OR ("vehicle_released_at" IS NOT NULL AND "confirmed_departure_at" >= "vehicle_released_at"))
);

CREATE TABLE "idempotency_record" (
  "id" UUID PRIMARY KEY, "demo_generation_id" UUID NOT NULL REFERENCES "demo_generation"("id"),
  "operation_id" TEXT NOT NULL, "idempotency_key" TEXT NOT NULL, "request_fingerprint" CHAR(64) NOT NULL,
  "status" TEXT NOT NULL, "response_status" INTEGER, "response_body" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "completed_at" TIMESTAMPTZ(3),
  UNIQUE ("demo_generation_id", "operation_id", "idempotency_key"),
  CONSTRAINT "ck_idempotency_status" CHECK ("status" IN ('IN_PROGRESS','COMPLETED','FAILED'))
);
CREATE TABLE "domain_event" (
  "id" UUID PRIMARY KEY, "demo_generation_id" UUID NOT NULL REFERENCES "demo_generation"("id"),
  "event_type" TEXT NOT NULL, "schema_version" INTEGER NOT NULL, "aggregate_type" TEXT NOT NULL,
  "aggregate_id" UUID NOT NULL, "aggregate_version" INTEGER NOT NULL, "aggregate_sequence" INTEGER NOT NULL,
  "correlation_id" UUID NOT NULL, "causation_id" UUID, "idempotency_record_id" UUID REFERENCES "idempotency_record"("id"),
  "source_type" TEXT NOT NULL, "source_id" TEXT, "data_classification" TEXT NOT NULL,
  "demo_seed_version" TEXT NOT NULL, "demo_mode" BOOLEAN NOT NULL, "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL, "recorded_at" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("aggregate_type", "aggregate_id", "aggregate_sequence"),
  CONSTRAINT "ck_domain_event_schema" CHECK ("schema_version" = 2),
  CONSTRAINT "ck_domain_event_sequence" CHECK ("aggregate_sequence" = "aggregate_version")
);

CREATE TABLE "conversation" (
  "id" UUID PRIMARY KEY, "channel_code" TEXT NOT NULL, "provider_thread_id" TEXT NOT NULL UNIQUE,
  "subject_text" TEXT, "link_status" TEXT NOT NULL, "suggested_case_id" UUID REFERENCES "case_record"("id"),
  "confirmed_case_id" UUID REFERENCES "case_record"("id"), "suggestion_reason_codes" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL, "version" INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE "communication_message" (
  "id" UUID PRIMARY KEY, "conversation_id" UUID NOT NULL REFERENCES "conversation"("id"),
  "external_message_id" TEXT NOT NULL UNIQUE, "direction" TEXT NOT NULL, "sender_address" TEXT,
  "sender_display_name" TEXT, "subject_text" TEXT, "body_text" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL, "recorded_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "phone_call" (
  "id" UUID PRIMARY KEY, "case_id" UUID NOT NULL REFERENCES "case_record"("id"), "direction" TEXT NOT NULL,
  "contact_display_name" TEXT, "contact_phone" TEXT, "summary" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL, "recorded_by_user_id" UUID NOT NULL REFERENCES "app_user"("id"),
  "created_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "demo_internal_session" (
  "id" UUID PRIMARY KEY, "user_id" UUID NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "demo_generation_id" UUID NOT NULL REFERENCES "demo_generation"("id"),
  "session_token_hash" CHAR(64) NOT NULL, "csrf_token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "idle_expires_at" TIMESTAMPTZ(3) NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3), "revocation_reason_code" TEXT, "replaced_by_session_id" UUID,
  "created_ip_hash" CHAR(64), "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "uq_demo_internal_session_token_hash" UNIQUE ("session_token_hash"),
  CONSTRAINT "ck_demo_internal_session_revocation" CHECK (("revoked_at" IS NULL) = ("revocation_reason_code" IS NULL)),
  CONSTRAINT "ck_demo_internal_session_expiry" CHECK ("idle_expires_at" <= "expires_at")
);

CREATE TABLE "integration_outbox" (
  "id" UUID PRIMARY KEY, "domain_event_id" UUID NOT NULL UNIQUE REFERENCES "domain_event"("id") ON DELETE CASCADE,
  "demo_generation_id" UUID NOT NULL REFERENCES "demo_generation"("id"), "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "status" TEXT NOT NULL, "available_at" TIMESTAMPTZ(3) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0, "claimed_by" TEXT, "claim_expires_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3), "last_error_code" TEXT, "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ck_outbox_status" CHECK ("status" IN ('PENDING','CLAIMED','PUBLISHED','FAILED'))
);
CREATE INDEX "ix_outbox_dispatch" ON "integration_outbox"("status", "available_at");
CREATE TABLE "worker_lease" (
  "lease_code" TEXT PRIMARY KEY, "owner_instance_id" TEXT NOT NULL,
  "demo_generation_id" UUID NOT NULL REFERENCES "demo_generation"("id"),
  "claimed_at" TIMESTAMPTZ(3) NOT NULL, "heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "ck_worker_lease_expiry" CHECK ("expires_at" > "heartbeat_at")
);
CREATE TABLE "security_audit_record" (
  "id" UUID PRIMARY KEY, "demo_generation_id" UUID NOT NULL, "actor_type" TEXT NOT NULL,
  "actor_id" UUID, "action_code" TEXT NOT NULL, "resource_type" TEXT NOT NULL, "resource_id" UUID,
  "decision" TEXT NOT NULL, "reason_code" TEXT NOT NULL, "metadata" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ck_security_audit_decision" CHECK ("decision" IN ('ALLOW','DENY'))
);
CREATE INDEX "ix_security_audit_occurred" ON "security_audit_record"("occurred_at");
