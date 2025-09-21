/**
 * キャッシュキー構築ヘルパー
 * codex推奨: 長さプレフィックス方式による確実な分割
 */

const SEPARATOR = ':';

/**
 * ユーザー・記事複合キー
 */
export interface CompositeKey {
  userId: string;
  articleId: string;
}

/**
 * キャッシュキー構築ユーティリティ
 * 長さプレフィックス方式による確実な分割を実装
 */
export class LengthPrefixedCacheKeyBuilder {
  /**
   * ユーザー・記事複合キーを構築
   * 長さプレフィックス方式: `[prefix:]userLen:userId:articleLen:articleId`
   */
  static buildUserArticleKey(userId: string, articleId: string, prefix?: string): string {
    const userLen = userId.length;
    const articleLen = articleId.length;
    const key = `${userLen}${SEPARATOR}${userId}${SEPARATOR}${articleLen}${SEPARATOR}${articleId}`;
    return prefix ? `${prefix}${SEPARATOR}${key}` : key;
  }

  /**
   * 複合キーから分解
   * 長さプレフィックス方式による確実な分割
   * prefix付きの場合は自動的に検出して剥がす
   */
  static parseUserArticleKey(compositeKey: string): CompositeKey | null {
    try {
      let keyToProcess = compositeKey;

      // prefixを検出して剥がす
      // prefixは数字で始まらないため、最初の文字が数字でなければprefixあり
      if (compositeKey && !/^\d/.test(compositeKey)) {
        const prefixEndIndex = compositeKey.indexOf(SEPARATOR);
        if (prefixEndIndex !== -1) {
          keyToProcess = compositeKey.slice(prefixEndIndex + 1);
        }
      }

      // 最初のセパレータを探してユーザー長を取得
      const firstSepIndex = keyToProcess.indexOf(SEPARATOR);
      if (firstSepIndex === -1) return null;

      const userLenStr = keyToProcess.slice(0, firstSepIndex);
      const userLen = parseInt(userLenStr, 10);
      if (isNaN(userLen) || userLen < 0) return null;

      // ユーザーIDを抽出
      const userStart = firstSepIndex + 1;
      const userEnd = userStart + userLen;
      if (userEnd > keyToProcess.length) return null;

      const userId = keyToProcess.slice(userStart, userEnd);

      // 次のセパレータを確認
      if (keyToProcess[userEnd] !== SEPARATOR) return null;

      // 記事長を取得
      const articleLenStart = userEnd + 1;
      const secondSepIndex = keyToProcess.indexOf(SEPARATOR, articleLenStart);
      if (secondSepIndex === -1) return null;

      const articleLenStr = keyToProcess.slice(articleLenStart, secondSepIndex);
      const articleLen = parseInt(articleLenStr, 10);
      if (isNaN(articleLen) || articleLen < 0) return null;

      // 記事IDを抽出
      const articleStart = secondSepIndex + 1;
      const articleEnd = articleStart + articleLen;
      if (articleEnd !== keyToProcess.length) return null;

      const articleId = keyToProcess.slice(articleStart, articleEnd);

      return { userId, articleId };
    } catch (error) {
      return null;
    }
  }

  /**
   * ユーザーパターン（無効化用）
   * 長さプレフィックス方式に対応
   */
  static buildUserPattern(userId: string, prefix?: string): string {
    const userLen = userId.length;
    const pattern = `${userLen}${SEPARATOR}${userId}${SEPARATOR}*`;
    return prefix ? `${prefix}${SEPARATOR}${pattern}` : pattern;
  }

  /**
   * バッチ処理用: 複数の記事IDを複合キーに変換
   */
  static buildBatchKeys(userId: string, articleIds: readonly string[], prefix?: string): string[] {
    return articleIds.map(id => this.buildUserArticleKey(userId, id, prefix));
  }

  /**
   * バッチ処理用: 複合キーから記事IDリストを抽出
   * 無効なキーは警告を出してスキップ
   */
  static extractArticleIds(compositeKeys: readonly string[]): string[] {
    const results: string[] = [];

    for (const key of compositeKeys) {
      const parsed = this.parseUserArticleKey(key);
      if (parsed !== null) {
        results.push(parsed.articleId);
      } else {
        // 無効なキーを警告（デバッグ用）
        console.warn(`CacheKeyBuilder: Invalid composite key format: ${key}`);
      }
    }

    return results;
  }

  /**
   * バッチ結果をマッピング: 記事ID結果 → 複合キー結果
   */
  static mapResults<T>(
    userId: string,
    articleResults: Map<string, T>,
    prefix?: string
  ): Map<string, T> {
    const compositeResults = new Map<string, T>();

    for (const [articleId, result] of articleResults.entries()) {
      const compositeKey = this.buildUserArticleKey(userId, articleId, prefix);
      compositeResults.set(compositeKey, result);
    }

    return compositeResults;
  }
}

/**
 * @deprecated CacheKeyBuilderは非推奨です。LengthPrefixedCacheKeyBuilderを直接使用してください。
 * 移行方法: import { CacheKeyBuilder } を import { LengthPrefixedCacheKeyBuilder } に変更
 */
export const CacheKeyBuilder = LengthPrefixedCacheKeyBuilder;