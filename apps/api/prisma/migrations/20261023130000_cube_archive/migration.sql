-- Archived cubes leave «Mis cubos»; their links are closed by the API. Additive, nothing is deleted.
ALTER TABLE "cubes" ADD COLUMN "archived_at" TIMESTAMPTZ(3);
