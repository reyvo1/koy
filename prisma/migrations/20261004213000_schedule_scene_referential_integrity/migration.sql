-- A schedule targeting a scene is not valid if that scene can disappear underneath it.
-- Refuse deployment when legacy orphan rows exist: deleting or rewriting operator schedules
-- automatically would hide data loss. Repair those rows explicitly, then rerun the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "schedules" s
    LEFT JOIN "scenes" sc
      ON sc."id" = s."targetSceneId"
     AND sc."tenantId" = s."tenantId"
    WHERE s."targetSceneId" IS NOT NULL
      AND sc."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'orphan schedule targetSceneId rows exist; repair them before adding scene FK';
  END IF;
END $$;

ALTER TABLE "schedules"
  ADD CONSTRAINT "schedules_targetSceneId_tenantId_fkey"
  FOREIGN KEY ("targetSceneId", "tenantId")
  REFERENCES "scenes"("id", "tenantId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
