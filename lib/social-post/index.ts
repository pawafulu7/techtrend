/**
 * Social Post Module
 *
 * X投稿コンテンツ自動生成機能
 */

// =============================================================================
// Types
// =============================================================================

export type {
  SocialPost,
  SocialPostAuditLog,
  SocialPostStatus,
  SocialPostSource,
  CreateSocialPostInput,
  UpdateSocialPostInput,
  GenerateParams,
  BulkActionParams,
  SocialPostFilters,
  PaginatedResult,
  GenerateResult,
  GeneratedContent,
  ValidationResult,
  GenerationContext,
  ArticleForPrompt,
  DailyTrendForPrompt,
  DiffSummaryForPrompt,
  XPostOutput,
  AuditAction,
  AuditMetadata,
} from './types';

// =============================================================================
// Validators
// =============================================================================

export {
  SocialPostCreateSchema,
  SocialPostUpdateSchema,
  SocialPostGenerateSchema,
  SocialPostAutoGenerateSchema,
  SocialPostBulkSchema,
  SocialPostFiltersSchema,
  validateGeneratedContent,
  normalizeHashtag,
  normalizeHashtags,
  calculateEffectiveLength,
  isValidForXPost,
} from './social-post-validator';

export type {
  SocialPostCreateInput,
  SocialPostUpdateInput,
  SocialPostGenerateInput,
  SocialPostAutoGenerateInput,
  SocialPostBulkInput,
  SocialPostFiltersInput,
} from './social-post-validator';

// =============================================================================
// Services
// =============================================================================

export {
  SocialPostService,
  getSocialPostService,
  resetSocialPostService,
} from './social-post-service';

export { SocialPostGenerator } from './social-post-generator';

export { SocialPostSelector } from './social-post-selector';

// =============================================================================
// Prompts
// =============================================================================

export {
  X_POST_PROMPT_VERSION,
  XPostOutputSchema,
  buildArticlePrompt,
  buildDailyTrendPrompt,
  buildDiffSummaryPrompt,
  createXPostExtractionConfig,
} from './prompts/x-post-prompt';

export type { XPostOutputType } from './prompts/x-post-prompt';

// =============================================================================
// Errors
// =============================================================================

export {
  NotFoundError,
  PromptInjectionError,
  DuplicateContentError,
} from './errors';
