export {
  derivePaletteFromEvents,
  isAnsweredPalette,
  paletteCounts,
  type EventType,
  type PaletteState,
  type AttemptEventLike,
  type QuestionRuntimeState,
} from "./palette";
export {
  scoreAttempt,
  NEET_MARKING,
  JEE_MARKING,
  type MarkingScheme,
  type QuestionForScore,
  type ScoredResponse,
} from "./scoring";
export {
  checkAttemptOpen,
  computeEndsAt,
  TIMER_RESYNC_MS,
  type TimerCheckResult,
} from "./timer";
export {
  extractPaperQuestions,
  validateExtractedQuestions,
  solveMissingAnswers,
  paperExtractSchema,
  type ExtractedPaper,
  type ExtractedQuestion,
  type ValidatedQuestion,
} from "./paper-extract";
