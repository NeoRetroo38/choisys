-- AlterTable
ALTER TABLE "cube_data" ADD COLUMN     "cube_version_id" UUID,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cubes" (
    "id" UUID NOT NULL,
    "owner_profile_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cubes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cube_versions" (
    "id" UUID NOT NULL,
    "cube_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "phases" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cube_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cubes_owner_profile_id_idx" ON "cubes"("owner_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "cube_versions_cube_id_version_key" ON "cube_versions"("cube_id", "version");

-- AddForeignKey
ALTER TABLE "cube_data" ADD CONSTRAINT "cube_data_cube_version_id_fkey" FOREIGN KEY ("cube_version_id") REFERENCES "cube_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cubes" ADD CONSTRAINT "cubes_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cube_versions" ADD CONSTRAINT "cube_versions_cube_id_fkey" FOREIGN KEY ("cube_id") REFERENCES "cubes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

