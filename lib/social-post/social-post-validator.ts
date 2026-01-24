/**
 * Social Post Validator
 *
 * 入力検証・コンテンツ検証
 */

import { z } from 'zod';
import type { ValidationResult } from './types';

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * ハッシュタグ正規表現（日本語対応）
 */
const HASHTAG_REGEX = /^#?[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;

/**
 * SocialPost作成スキーマ
 */
export const SocialPostCreateSchema = z
  .object({
    content: z
      .string()
      .min(1, 'Content is required')
      .max(280, 'Content exceeds X character limit')
      .refine(
        (val) => !/<script|javascript:|data:/i.test(val),
        'Invalid content: potential injection detected'
      ),
    hashtags: z
      .array(z.string().regex(HASHTAG_REGEX, 'Invalid hashtag format'))
      .max(10),
    sourceUrls: z
      .array(
        z
          .string()
          .url('Invalid URL format')
          .refine(
            (url) => /^https?:\/\//i.test(url),
            'Only http/https URLs are allowed'
          )
      )
      .max(5),
    source: z.enum(['ARTICLE', 'DAILY_TREND', 'DIFF_SUMMARY', 'MANUAL']),
    sourceIds: z.array(z.string()).optional(),
    modelVersion: z.string().optional(),
    promptVersion: z.string().optional(),
    contextSummary: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      // 非MANUALソースの場合はsourceIdsが必須
      if (data.source !== 'MANUAL') {
        return data.sourceIds && data.sourceIds.length > 0;
      }
      return true;
    },
    {
      message: 'sourceIds is required for non-MANUAL sources',
      path: ['sourceIds'],
    }
  );

export type SocialPostCreateInput = z.infer<typeof SocialPostCreateSchema>;

/**
 * SocialPost更新スキーマ
 */
export const SocialPostUpdateSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(280)
      .refine(
        (val) => !/<script|javascript:|data:/i.test(val),
        'Invalid content: potential injection detected'
      )
      .optional(),
    hashtags: z.array(z.string().regex(HASHTAG_REGEX)).max(10).optional(),
    sourceUrls: z
      .array(
        z
          .string()
          .url()
          .refine(
            (url) => /^https?:\/\//i.test(url),
            'Only http/https URLs are allowed'
          )
      )
      .max(5)
      .optional(),
    status: z.enum(['DRAFT', 'REVIEWED', 'SCHEDULED', 'ARCHIVED']).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      // SCHEDULEDステータスの場合はscheduledAtが必須
      if (data.status === 'SCHEDULED') {
        return data.scheduledAt !== undefined && data.scheduledAt !== null;
      }
      return true;
    },
    {
      message: 'scheduledAt is required when status is SCHEDULED',
      path: ['scheduledAt'],
    }
  );

export type SocialPostUpdateInput = z.infer<typeof SocialPostUpdateSchema>;

/**
 * AI生成リクエストスキーマ
 */
export const SocialPostGenerateSchema = z.object({
  source: z.enum(['ARTICLE', 'DAILY_TREND', 'DIFF_SUMMARY']),
  sourceIds: z
    .array(z.string())
    .min(1, 'At least one source ID is required')
    .max(5),
});

export type SocialPostGenerateInput = z.infer<typeof SocialPostGenerateSchema>;

/**
 * 一括操作スキーマ
 */
export const SocialPostBulkSchema = z
  .object({
    action: z.enum(['changeStatus', 'delete']),
    ids: z.array(z.string()).min(1, 'At least one ID is required').max(50),
    status: z.enum(['DRAFT', 'REVIEWED', 'ARCHIVED']).optional(),
  })
  .refine(
    (data) => data.action !== 'changeStatus' || data.status !== undefined,
    {
      message: 'Status is required when action is changeStatus',
      path: ['status'],
    }
  );

export type SocialPostBulkInput = z.infer<typeof SocialPostBulkSchema>;

/**
 * フィルタースキーマ
 */
export const SocialPostFiltersSchema = z
  .object({
    status: z
      .enum([
        'DRAFT',
        'REVIEWED',
        'SCHEDULED',
        'POSTING',
        'POSTED',
        'FAILED',
        'ARCHIVED',
        'all',
      ])
      .optional(),
    source: z
      .enum(['ARTICLE', 'DAILY_TREND', 'DIFF_SUMMARY', 'MANUAL', 'all'])
      .optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
  })
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo) {
        return new Date(data.dateFrom) <= new Date(data.dateTo);
      }
      return true;
    },
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateFrom'],
    }
  );

export type SocialPostFiltersInput = z.infer<typeof SocialPostFiltersSchema>;

// =============================================================================
// Content Validation
// =============================================================================

/**
 * 禁止表現パターン
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /注目/,
  /革新的/,
  /画期的/,
  /必見/,
  /話題/,
  /すごい/,
  /やばい/,
  /最高/,
  /超おすすめ/,
];

/**
 * 不審なURLパターン
 * Note: t.coはX/Twitter公式の短縮URLのため除外
 */
const SUSPICIOUS_URL_PATTERNS: RegExp[] = [
  /\.(exe|bat|cmd|sh|ps1|vbs|msi)$/i,
  /bit\.ly|tinyurl/i, // 短縮URLは手動確認が必要（t.coはX公式のため除外）
];

/**
 * AI生成コンテンツの検証
 */
export function validateGeneratedContent(content: string): ValidationResult {
  const errors: string[] = [];

  // 文字数チェック
  if (content.length > 280) {
    errors.push(`Content exceeds 280 characters (current: ${content.length})`);
  }

  if (content.length < 10) {
    errors.push('Content is too short (minimum: 10 characters)');
  }

  // 禁止表現チェック
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`Forbidden phrase detected: ${pattern.source}`);
    }
  }

  // 不正URL検出
  const urls = content.match(/https?:\/\/[^\s]+/g) || [];
  for (const url of urls) {
    for (const suspiciousPattern of SUSPICIOUS_URL_PATTERNS) {
      if (suspiciousPattern.test(url)) {
        errors.push(`Suspicious URL detected: ${url}`);
      }
    }
  }

  // 空白のみのコンテンツチェック
  if (content.trim().length === 0) {
    errors.push('Content cannot be empty or whitespace only');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * ハッシュタグの正規化
 */
export function normalizeHashtag(hashtag: string): string {
  // #がなければ追加
  const normalized = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
  // スペースや特殊文字を除去
  return normalized.replace(
    /[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF#]/g,
    ''
  );
}

/**
 * 複数ハッシュタグの正規化
 */
export function normalizeHashtags(hashtags: string[]): string[] {
  return hashtags.map(normalizeHashtag).filter((tag) => tag.length > 1); // #のみは除外
}

/**
 * X投稿の実効文字数を計算
 * URLは23文字としてカウント
 */
export function calculateEffectiveLength(
  content: string,
  sourceUrls: string[]
): number {
  // URLを仮の23文字文字列に置換してカウント
  let effective = content;
  const urlRegex = /https?:\/\/[^\s]+/g;
  effective = effective.replace(urlRegex, 'x'.repeat(23));

  // sourceUrlsを追加（スペース + URL）
  const urlLength = sourceUrls.length > 0 ? sourceUrls.length * 24 : 0; // スペース + 23文字

  return effective.length + urlLength;
}

/**
 * X投稿として有効かチェック
 */
export function isValidForXPost(
  content: string,
  hashtags: string[],
  sourceUrls: string[]
): ValidationResult {
  const errors: string[] = [];

  // ハッシュタグを含めた実効長を計算
  const hashtagsText = hashtags.join(' ');
  const fullContent = `${content} ${hashtagsText}`.trim();
  const effectiveLength = calculateEffectiveLength(fullContent, sourceUrls);

  if (effectiveLength > 280) {
    errors.push(
      `Post exceeds 280 characters (effective: ${effectiveLength}). ` +
        `Note: URLs count as 23 characters each.`
    );
  }

  // コンテンツ検証（文字数チェックはすでに行ったのでスキップ）
  const contentValidation = validateGeneratedContent(content);
  // 文字数関連のエラーを除外して追加（重複防止）
  // 明示的なパターンマッチで除外対象を特定
  const lengthErrorPatterns = [/exceeds \d+ characters/, /too short.*minimum/];
  const nonLengthErrors = contentValidation.errors.filter(
    (err) => !lengthErrorPatterns.some((pattern) => pattern.test(err))
  );
  errors.push(...nonLengthErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}
