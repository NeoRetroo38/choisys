-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV');

-- CreateEnum
CREATE TYPE "CubeDataType" AS ENUM ('SESSION', 'RUN');

-- CreateEnum
CREATE TYPE "CubeDataStatus" AS ENUM ('CREATED', 'ACTIVE', 'COMPLETED', 'INTERRUPTED', 'FAILED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "display_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cube_data" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "type" "CubeDataType" NOT NULL,
    "run_id" UUID,
    "session_index" INTEGER,
    "phase_index" INTEGER,
    "status" "CubeDataStatus" NOT NULL DEFAULT 'CREATED',
    "input_data" JSONB,
    "output_data" JSONB,
    "inference_data" JSONB,
    "metadata" JSONB,
    "engine_version" VARCHAR(64) NOT NULL,
    "scenario_version" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cube_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" "Role" NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission_id")
);

-- CreateTable
CREATE TABLE "role_changes" (
    "id" UUID NOT NULL,
    "target_profile_id" UUID,
    "actor_profile_id" UUID,
    "from_role" "Role",
    "to_role" "Role" NOT NULL,
    "reason" VARCHAR(240),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_sessions_token_hash_key" ON "account_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "account_sessions_account_id_idx" ON "account_sessions"("account_id");

-- CreateIndex
CREATE INDEX "account_sessions_expires_at_idx" ON "account_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_account_id_key" ON "profiles"("account_id");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE INDEX "cube_data_profile_id_idx" ON "cube_data"("profile_id");

-- CreateIndex
CREATE INDEX "cube_data_run_id_idx" ON "cube_data"("run_id");

-- CreateIndex
CREATE INDEX "cube_data_type_idx" ON "cube_data"("type");

-- CreateIndex
CREATE INDEX "cube_data_created_at_idx" ON "cube_data"("created_at");

-- CreateIndex
CREATE INDEX "cube_data_profile_id_created_at_idx" ON "cube_data"("profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cube_data_run_id_session_index_key" ON "cube_data"("run_id", "session_index");

-- CreateIndex
CREATE UNIQUE INDEX "cube_data_run_id_phase_index_key" ON "cube_data"("run_id", "phase_index");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "role_changes_target_profile_id_created_at_idx" ON "role_changes"("target_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "role_changes_actor_profile_id_idx" ON "role_changes"("actor_profile_id");

-- CreateIndex
CREATE INDEX "role_changes_created_at_idx" ON "role_changes"("created_at");

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "cube_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_changes" ADD CONSTRAINT "role_changes_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_changes" ADD CONSTRAINT "role_changes_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written invariants that Prisma cannot express (see apps/api/prisma/README.md).
-- Verified with apps/api/prisma/verify-migration.mjs.
-- ---------------------------------------------------------------------------

-- cube_data: indexes are never negative, and RUN / SESSION rows have the right shape.
ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_indexes_non_negative"
  CHECK (("session_index" IS NULL OR "session_index" >= 0) AND ("phase_index" IS NULL OR "phase_index" >= 0));

ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_type_shape"
  CHECK (
    ("type" = 'RUN' AND "run_id" IS NULL AND "session_index" IS NULL AND "phase_index" IS NULL)
    OR
    ("type" = 'SESSION' AND "run_id" IS NOT NULL AND "session_index" IS NOT NULL AND "phase_index" IS NOT NULL AND "run_id" <> "id")
  );

-- permissions: stable dotted identifiers, e.g. role.assign
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_key_format"
  CHECK ("key" ~ '^[a-z_]+(\.[a-z_]+)+$');

-- role_changes: a change must actually change the role.
ALTER TABLE "role_changes" ADD CONSTRAINT "role_changes_role_differs"
  CHECK ("from_role" IS DISTINCT FROM "to_role");

-- role_changes: append-only audit. DELETE is always rejected. UPDATE is allowed only for the
-- ON DELETE SET NULL cascade (profile links becoming NULL), never for the facts of the change.
CREATE FUNCTION "role_changes_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'role_changes is append-only' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."from_role" IS DISTINCT FROM OLD."from_role"
     OR NEW."to_role" IS DISTINCT FROM OLD."to_role"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
     OR (NEW."target_profile_id" IS NOT NULL AND NEW."target_profile_id" IS DISTINCT FROM OLD."target_profile_id")
     OR (NEW."actor_profile_id" IS NOT NULL AND NEW."actor_profile_id" IS DISTINCT FROM OLD."actor_profile_id") THEN
    RAISE EXCEPTION 'role_changes is append-only' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "role_changes_append_only"
  BEFORE UPDATE OR DELETE ON "role_changes"
  FOR EACH ROW EXECUTE FUNCTION "role_changes_guard"();
