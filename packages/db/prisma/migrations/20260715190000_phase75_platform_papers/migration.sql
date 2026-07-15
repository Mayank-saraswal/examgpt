-- Phase 7.5: platform PYQ bank (Test.visibility + nullable userId)

CREATE TYPE "TestVisibility" AS ENUM ('PRIVATE', 'PLATFORM');

-- Make userId nullable for PLATFORM rows
ALTER TABLE "Test" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "Test" ADD COLUMN "visibility" "TestVisibility" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "Test" ADD COLUMN "examType" "ExamType";
ALTER TABLE "Test" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "Test" ADD COLUMN "contentHash" TEXT;

-- PRIVATE must have owner; PLATFORM may be null-owned
ALTER TABLE "Test" ADD CONSTRAINT "Test_visibility_userId_check" CHECK (
  ("visibility" = 'PRIVATE' AND "userId" IS NOT NULL)
  OR ("visibility" = 'PLATFORM')
);

CREATE INDEX "Test_visibility_publishedAt_idx" ON "Test"("visibility", "publishedAt");
CREATE INDEX "Test_visibility_examType_paperYear_idx" ON "Test"("visibility", "examType", "paperYear");
CREATE INDEX "Test_contentHash_idx" ON "Test"("contentHash");
