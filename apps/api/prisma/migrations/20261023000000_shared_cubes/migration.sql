-- Cubos de referencia compartidos por enlace. Aditiva: no borra ni reescribe filas existentes.
-- cube_data.profile_id pasa a admitir NULL solo para las runs de participantes sin cuenta; todas las filas
-- existentes conservan su perfil y la restricción CHECK garantiza un único dueño por fila.

-- AlterTable
ALTER TABLE "cube_data" ALTER COLUMN "profile_id" DROP NOT NULL,
ADD COLUMN     "participant_id" UUID;

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

-- CreateIndex
CREATE INDEX "cube_data_participant_id_idx" ON "cube_data"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cube_shares_token_key" ON "cube_shares"("token");

-- CreateIndex
CREATE INDEX "cube_shares_cube_version_id_idx" ON "cube_shares"("cube_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "cube_participants_token_hash_key" ON "cube_participants"("token_hash");

-- CreateIndex
CREATE INDEX "cube_participants_share_id_idx" ON "cube_participants"("share_id");

-- AddForeignKey
ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "cube_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_shares" ADD CONSTRAINT "cube_shares_cube_version_id_fkey" FOREIGN KEY ("cube_version_id") REFERENCES "cube_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_shares" ADD CONSTRAINT "cube_shares_reference_run_id_fkey" FOREIGN KEY ("reference_run_id") REFERENCES "cube_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_participants" ADD CONSTRAINT "cube_participants_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "cube_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one owner per row: an account profile or a participant. Prisma does not model CHECK constraints.
ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_one_owner" CHECK (("profile_id" IS NULL) <> ("participant_id" IS NULL));
