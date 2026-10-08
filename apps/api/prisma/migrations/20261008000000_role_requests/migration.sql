-- Source only: applying this migration to a real database requires a separate approved operation.
CREATE TYPE "RoleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "role_requests" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "requested_role" "Role" NOT NULL,
  "status" "RoleRequestStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(3),
  "decided_by_profile_id" UUID,
  "reason" VARCHAR(240),
  CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_requests_requested_role" CHECK ("requested_role" <> 'USER'),
  CONSTRAINT "role_requests_decision_shape" CHECK (
    ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_profile_id" IS NULL AND "reason" IS NULL)
    OR ("status" <> 'PENDING' AND "decided_at" IS NOT NULL)
  ),
  CONSTRAINT "role_requests_no_self_approval" CHECK (
    "status" <> 'APPROVED' OR "decided_by_profile_id" IS DISTINCT FROM "profile_id"
  )
);

CREATE UNIQUE INDEX "role_requests_profile_id_key" ON "role_requests"("profile_id");
CREATE INDEX "role_requests_status_created_at_idx" ON "role_requests"("status", "created_at");
CREATE INDEX "role_requests_decided_by_profile_id_idx" ON "role_requests"("decided_by_profile_id");
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_decided_by_profile_id_fkey"
  FOREIGN KEY ("decided_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A request cannot be retargeted or decided twice. Account deletion may null the deciding profile link.
CREATE FUNCTION "role_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PENDING' AND NEW."status" <> 'PENDING' AND NEW."decided_by_profile_id" IS NULL THEN
    RAISE EXCEPTION 'role request decision needs an actor' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."profile_id" IS DISTINCT FROM OLD."profile_id"
     OR NEW."requested_role" IS DISTINCT FROM OLD."requested_role" OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
     OR (OLD."status" <> 'PENDING' AND (
       NEW."status" IS DISTINCT FROM OLD."status" OR NEW."decided_at" IS DISTINCT FROM OLD."decided_at"
       OR NEW."reason" IS DISTINCT FROM OLD."reason"
       OR (NEW."decided_by_profile_id" IS NOT NULL AND NEW."decided_by_profile_id" IS DISTINCT FROM OLD."decided_by_profile_id")
     )) THEN
    RAISE EXCEPTION 'role request is immutable after decision' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "role_requests_decide_once" BEFORE UPDATE ON "role_requests"
  FOR EACH ROW EXECUTE FUNCTION "role_requests_guard"();
