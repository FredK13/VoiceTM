-- 1) Add the new column first (nullable so we can backfill safely)
ALTER TABLE "User" ADD COLUMN "voiceSampleMs" INTEGER;


-- 2) Backfill from the old column (seconds -> ms)
UPDATE "User"
SET "voiceSampleMs" = COALESCE("voiceSampleSeconds", 0) * 1000;


-- 3) Make it required + default
ALTER TABLE "User"
ALTER COLUMN "voiceSampleMs" SET NOT NULL,
ALTER COLUMN "voiceSampleMs" SET DEFAULT 0;


-- 4) Drop the old column
ALTER TABLE "User" DROP COLUMN "voiceSampleSeconds";
