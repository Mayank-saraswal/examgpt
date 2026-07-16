-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingStep" TEXT NOT NULL DEFAULT 'profile';

-- AlterTable
ALTER TABLE "ExamProfile" ADD COLUMN IF NOT EXISTS "targetScore" INTEGER;
