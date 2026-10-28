-- Cubos de referencia compartidos por enlace. Solo crea tablas, índices y claves foráneas: no toca
-- ninguna tabla ni fila existente. Las runs de participantes sin cuenta viven en su propia tabla.

-- CreateTable
CREATE TABLE "cube_shares" (
    "id" UUID NOT NULL,
    "cube_version_id" UUID NOT NULL,
    "reference_run_id" UUID,
    "token" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "cube_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cube_participants" (
    "id" UUID NOT NULL,
    "share_id" UUID NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cube_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cube_participant_runs" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "cube_version_id" UUID NOT NULL,
    "output_data" JSONB NOT NULL,
    "inference_data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cube_participant_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cube_shares_token_key" ON "cube_shares"("token");

-- CreateIndex
CREATE INDEX "cube_shares_cube_version_id_idx" ON "cube_shares"("cube_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "cube_participants_token_hash_key" ON "cube_participants"("token_hash");

-- CreateIndex
CREATE INDEX "cube_participants_share_id_idx" ON "cube_participants"("share_id");

-- CreateIndex
CREATE INDEX "cube_participant_runs_participant_id_created_at_idx" ON "cube_participant_runs"("participant_id", "created_at");

-- CreateIndex
CREATE INDEX "cube_participant_runs_cube_version_id_idx" ON "cube_participant_runs"("cube_version_id");

-- AddForeignKey
ALTER TABLE "cube_shares" ADD CONSTRAINT "cube_shares_cube_version_id_fkey" FOREIGN KEY ("cube_version_id") REFERENCES "cube_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_shares" ADD CONSTRAINT "cube_shares_reference_run_id_fkey" FOREIGN KEY ("reference_run_id") REFERENCES "cube_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_participants" ADD CONSTRAINT "cube_participants_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "cube_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_participant_runs" ADD CONSTRAINT "cube_participant_runs_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "cube_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_participant_runs" ADD CONSTRAINT "cube_participant_runs_cube_version_id_fkey" FOREIGN KEY ("cube_version_id") REFERENCES "cube_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
