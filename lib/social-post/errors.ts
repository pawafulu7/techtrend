/**
 * Social Post Custom Errors
 *
 * カスタムエラークラス（型安全なエラーハンドリング用）
 */

/**
 * リソースが見つからない場合のエラー
 */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/**
 * プロンプトインジェクション検出エラー
 */
export class PromptInjectionError extends Error {
  readonly code = 'PROMPT_INJECTION' as const;

  constructor(message = 'Potential prompt injection detected') {
    super(message);
    this.name = 'PromptInjectionError';
  }
}

/**
 * 重複コンテンツエラー
 */
export class DuplicateContentError extends Error {
  readonly code = 'DUPLICATE_CONTENT' as const;

  constructor(message = 'Duplicate content detected') {
    super(message);
    this.name = 'DuplicateContentError';
  }
}
