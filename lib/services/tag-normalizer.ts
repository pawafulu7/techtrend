/**
 * TagNormalizer - Canonical tag name normalization
 *
 * Normalizes tag names to canonical forms and infers categories.
 * Rules are defined in ./tag-normalization-rules.ts
 *
 * @example
 * ```typescript
 * TagNormalizer.normalize('typescript'); // { name: 'TypeScript', category: 'language' }
 * TagNormalizer.normalizeTags(['js', 'TS']); // [{ name: 'JavaScript', ... }, { name: 'TypeScript', ... }]
 * TagNormalizer.inferCategory(TagNormalizer.normalizeTags(['React'])); // 'framework'
 * ```
 */

import type { NormalizationRule } from './tag-normalization-rules';
import { TAG_NORMALIZATION_RULES } from './tag-normalization-rules';

export class TagNormalizer {
  private static rules: readonly NormalizationRule[] = TAG_NORMALIZATION_RULES;

  /**
   * タグを正規化
   */
  static normalize(tag: string): { name: string; category?: string } {
    const trimmed = tag.trim();

    // ルールベースの正規化
    for (const rule of this.rules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(trimmed)) {
          return {
            name: rule.canonical,
            category: rule.category,
          };
        }
      }
    }

    // ルールに一致しない場合は、基本的な正規化のみ
    return {
      name: this.basicNormalize(trimmed),
      category: undefined,
    };
  }

  /**
   * 基本的な正規化（大文字小文字、スペース統一）
   */
  private static basicNormalize(tag: string): string {
    // 先頭を大文字に、残りは元の大文字小文字を維持
    if (!tag) return tag;

    // 特殊文字の正規化
    let normalized = tag
      .replace(/\s+/g, ' ') // 複数スペースを1つに
      .replace(/[_]+/g, '-') // アンダースコアをハイフンに
      .trim();

    // 完全に大文字の略語（AWS, API等）はそのまま
    if (/^[A-Z]+$/.test(normalized)) {
      return normalized;
    }

    // 頭文字を大文字に（略語でない場合）
    if (!/^[A-Z]{2,}/.test(normalized)) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    return normalized;
  }

  /**
   * タグ配列を正規化し、重複を削除
   */
  static normalizeTags(
    tags: string[]
  ): Array<{ name: string; category?: string }> {
    const normalizedMap = new Map<
      string,
      { name: string; category?: string }
    >();

    for (const tag of tags) {
      const normalized = this.normalize(tag);
      // 空文字はスキップ
      if (!normalized.name) continue;
      // 重複を避けるため、正規化後の名前をキーとして使用
      if (!normalizedMap.has(normalized.name)) {
        normalizedMap.set(normalized.name, normalized);
      }
    }

    return Array.from(normalizedMap.values());
  }

  /**
   * カテゴリを推測（最初のタグのカテゴリを使用）
   */
  static inferCategory(
    tags: Array<{ name: string; category?: string }>
  ): string | undefined {
    for (const tag of tags) {
      if (tag.category) {
        return tag.category;
      }
    }
    return undefined;
  }
}

// Re-export for backwards compatibility
export type { NormalizationRule } from './tag-normalization-rules';
