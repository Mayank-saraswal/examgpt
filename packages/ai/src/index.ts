export {
  getModelConfig,
  listTasks,
  listOpenRouterTasks,
  getDefaultModelId,
  setRuntimeModelOverride,
  clearRuntimeModelOverrides,
  getAllDefaults,
  type AiTask,
  type ModelConfig,
} from "./registry";
export {
  validateOpenRouterModels,
  type OpenRouterValidateResult,
} from "./openrouter-validate";
export {
  setUsageSink,
  getUsageSink,
  getDailyBudgetUsd,
  estimateCostUsd,
  assertUnderDailyBudget,
  logAiUsage,
  withAiUsage,
  DailyBudgetExceededError,
  type AiUsageRecord,
  type UsageSink,
} from "./usage";
export {
  chunkPage,
  chunkPages,
  estimateTokens,
  splitAtomicBlocks,
  assertChunkInvariants,
  type PageInput,
  type TextChunk,
} from "./chunking";
export { ocrPage, type PageOcrResult } from "./ocr";
export {
  embedText,
  embedTexts,
  sparseEncode,
  getEmbeddingModelId,
  EMBEDDING_DIMENSIONS,
} from "./embeddings";
export {
  citationSchema,
  webSourceSchema,
  extractCitationMarkers,
  validateAndSanitizeCitations,
  NOT_IN_NOTES_MESSAGE,
  NOT_IN_NOTES_MESSAGE_HI,
  type Citation,
  type WebSource,
  type RetrievedChunk,
  type CitationValidationResult,
} from "./citations";
export { reciprocalRankFusion } from "./rrf";
export { rewriteQuery, isQueryVagueHeuristic, type RewriteResult } from "./rewrite";
export {
  assembleContext,
  buildRagSystemPrompt,
  DEFAULT_RETRIEVAL_SCORE_THRESHOLD,
  DEFAULT_TOP_K,
} from "./context";
export {
  streamNotesAnswer,
  generateWebAnswer,
  generateClarifyingQuestion,
  generateChatTitle,
  notInNotesResult,
  type RagAnswerKind,
  type RagAnswerResult,
} from "./answer";
export {
  runRagPipeline,
  type HybridSearchFn,
  type RunRagOptions,
  type RunRagMeta,
} from "./pipeline";
export {
  searchMemories,
  addMemory,
  memoryFactsToStrings,
  type MemoryFact,
} from "./memory";
export { getLanguageModel, getTaskModelId } from "./providers";
export * from "./exam";
