-- CreateEnum
CREATE TYPE "TestSource" AS ENUM ('PYQ_UPLOAD', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('EXTRACTING', 'GENERATING', 'NEEDS_REVIEW', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ANALYZED');

-- CreateEnum
CREATE TYPE "SubmitType" AS ENUM ('MANUAL', 'AUTO_TIMEOUT');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('VISIT', 'LEAVE', 'SELECT', 'CHANGE', 'CLEAR', 'MARK_REVIEW', 'UNMARK_REVIEW', 'SAVE_NEXT', 'APP_BACKGROUND', 'APP_FOREGROUND');

-- CreateEnum
CREATE TYPE "PaletteState" AS ENUM ('NOT_VISITED', 'NOT_ANSWERED', 'ANSWERED', 'MARKED', 'ANSWERED_MARKED');

-- CreateTable
CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "TestSource" NOT NULL,
    "title" TEXT NOT NULL,
    "paperDocumentId" TEXT,
    "paperYear" INTEGER,
    "config" JSONB,
    "durationMin" INTEGER NOT NULL DEFAULT 180,
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "markingScheme" JSONB NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'EXTRACTING',
    "syllabusMatchScore" DOUBLE PRECISION,
    "failureReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "section" TEXT,
    "text" TEXT NOT NULL,
    "imageKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" JSONB NOT NULL,
    "correctKey" TEXT,
    "answerConfidence" DOUBLE PRECISION,
    "topic" TEXT,
    "subtopic" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "explanationCache" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submitType" "SubmitType",
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptEvent" (
    "id" BIGSERIAL NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "type" "EventType" NOT NULL,
    "optionKey" TEXT,
    "clientTs" TIMESTAMP(3) NOT NULL,
    "serverTs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT NOT NULL,

    CONSTRAINT "AttemptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "selectedKey" TEXT,
    "paletteState" "PaletteState" NOT NULL DEFAULT 'NOT_VISITED',
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "optionChanges" INTEGER NOT NULL DEFAULT 0,
    "isCorrect" BOOLEAN,
    "marksAwarded" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Test_userId_status_idx" ON "Test"("userId", "status");

-- CreateIndex
CREATE INDEX "Test_userId_createdAt_idx" ON "Test"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Question_testId_idx" ON "Question"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_testId_index_key" ON "Question"("testId", "index");

-- CreateIndex
CREATE INDEX "Attempt_userId_status_idx" ON "Attempt"("userId", "status");

-- CreateIndex
CREATE INDEX "Attempt_testId_userId_idx" ON "Attempt"("testId", "userId");

-- CreateIndex
CREATE INDEX "Attempt_status_endsAt_idx" ON "Attempt"("status", "endsAt");

-- CreateIndex
CREATE INDEX "AttemptEvent_attemptId_questionIndex_idx" ON "AttemptEvent"("attemptId", "questionIndex");

-- CreateIndex
CREATE INDEX "AttemptEvent_attemptId_batchId_idx" ON "AttemptEvent"("attemptId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_attemptId_questionIndex_key" ON "Response"("attemptId", "questionIndex");

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptEvent" ADD CONSTRAINT "AttemptEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
