/**
 * LLM Extraction Module
 *
 * Exports for structured data extraction from LLM responses
 */

export {
  LLMExtractionPipeline,
  getLLMExtractionPipeline,
  resetLLMExtractionPipeline,
  type ExtractionOptions,
  type ExtractionResult,
  type ExtractionConfig,
} from './llm-extraction-pipeline';

export {
  // Diff Summary
  DiffChangeSchema,
  DiffSummaryOutputSchema,
  type DiffChange,
  type DiffSummaryOutput,
  // Viewpoint Map
  ViewpointIssueSchema,
  ViewpointMapOutputSchema,
  type ViewpointIssue,
  type ViewpointMapOutput,
  // Code Tips
  CodeTipOutputSchema,
  CodeTipsExtractionSchema,
  type CodeTipOutput,
  type CodeTipsExtraction,
  // Utilities
  parseJSONFromLLM,
  createCodeHash,
} from './extraction-schemas';

export {
  PROMPT_VERSIONS,
  getPromptVersion,
  type PromptType,
} from './prompt-versions';

export {
  BatchExecutor,
  type BatchJob,
  type BatchResult,
  type BatchExecutorOptions,
} from './batch-executor';
