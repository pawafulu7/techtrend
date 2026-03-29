/**
 * Cursor-based Pagination Manager
 * codex推奨: セキュアで効率的なカーソル実装
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

type CursorFilterValue = string | number | boolean | null;
export type CursorFilters = Record<string, CursorFilterValue>;

/**
 * カーソルペイロードの型定義
 */
export interface CursorPayload {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  values: Record<string, any>;
  limit: number;
  filters?: CursorFilters;
  version: number;
  timestamp: number;
}

/**
 * ページネーション情報
 */
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
  totalCount?: number;
}

/**
 * カーソルマネージャー設定
 */
export interface CursorManagerConfig {
  secret: string;
  maxAge?: number; // カーソルの有効期限（秒）
  version?: number; // カーソルスキーマバージョン
}

/**
 * カーソルベースページネーションマネージャー
 */
export class CursorManager {
  private secret: string;
  private maxAge: number;
  private version: number;

  constructor(config: CursorManagerConfig) {
    this.secret =
      config.secret ||
      env.CURSOR_SECRET ||
      randomBytes(32).toString('hex');
    this.maxAge = config.maxAge || 3600; // デフォルト1時間
    this.version = config.version || 1;
  }

  /**
   * カーソルを生成
   * codex推奨: HMAC署名 + base64url エンコーディング
   */
  encodeCursor(payload: Omit<CursorPayload, 'version' | 'timestamp'>): string {
    const fullPayload: CursorPayload = {
      ...payload,
      version: this.version,
      timestamp: Date.now(),
    };

    const jsonStr = JSON.stringify(fullPayload);
    const signature = this.generateSignature(jsonStr);
    const signedPayload = `${signature}.${jsonStr}`;

    // base64url エンコード（URLセーフ）
    return Buffer.from(signedPayload)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * カーソルを解析
   * codex推奨: 署名検証と有効期限チェック
   */
  decodeCursor(cursor: string): CursorPayload | null {
    try {
      // base64url デコード
      const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const signedPayload = Buffer.from(base64 + padding, 'base64').toString();

      const sep = signedPayload.indexOf('.');
      if (sep === -1) {
        logger.warn('cursor-manager.invalid-format');
        return null;
      }
      const signature = signedPayload.slice(0, sep);
      const jsonStr = signedPayload.slice(sep + 1);

      // 署名検証（バージョン別対応・タイミング攻撃対策）
      let isValid = false;

      // まず現在のバージョンで検証
      const expectedSignature = this.generateSignature(jsonStr);
      if (signature.length === expectedSignature.length) {
        try {
          isValid = timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
          );
        } catch (_err) {
          // hex decode エラーの場合は無効
          isValid = false;
        }
      }

      // 現在版で失敗した場合、旧バージョン（16文字）で検証
      if (!isValid && signature.length === 16) {
        const legacySignature = this.generateLegacySignature(jsonStr);
        try {
          isValid = timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(legacySignature, 'hex')
          );
        } catch (_err) {
          isValid = false;
        }
      }

      if (!isValid) {
        logger.warn('cursor-manager.invalid-signature');
        return null;
      }

      const payload: CursorPayload = JSON.parse(jsonStr);

      // バージョンチェック（v1, v2 両方受け入れ・移行期間）
      if (payload.version !== this.version && payload.version !== 1) {
        logger.warn(
          `cursor-manager.version-mismatch: expected=${this.version} or 1, got=${payload.version}`
        );
        return null;
      }

      // 有効期限チェック
      const age = (Date.now() - payload.timestamp) / 1000;
      if (age > this.maxAge) {
        logger.warn(`cursor-manager.expired: age=${age}s`);
        return null;
      }

      return payload;
    } catch (error) {
      logger.error(`cursor-manager.decode-error: ${error}`);
      return null;
    }
  }

  /**
   * HMAC署名を生成（フル長64文字）
   */
  private generateSignature(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('hex'); // フル長（64文字）
  }

  /**
   * 旧バージョン向けHMAC署名を生成（16文字・互換性用）
   */
  private generateLegacySignature(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('hex')
      .substring(0, 16); // 旧形式（16文字）
  }

  /**
   * ソート条件の一致を検証
   * codex推奨: ソート変更時のカーソル無効化
   */
  validateSortCondition(
    cursor: CursorPayload,
    currentSortBy: string,
    currentSortOrder: 'asc' | 'desc'
  ): boolean {
    return (
      cursor.sortBy === currentSortBy && cursor.sortOrder === currentSortOrder
    );
  }

  /**
   * フィルター条件の一致を検証（オプション）
   */
  validateFilters(
    cursor: CursorPayload,
    currentFilters?: CursorFilters
  ): boolean {
    if (!cursor.filters && !currentFilters) {
      return true;
    }

    if (!cursor.filters || !currentFilters) {
      return false;
    }

    // キー順序に依存しないフィールド単位の比較（フィルター値はプリミティブ型を前提）
    const cursorKeys = Object.keys(cursor.filters);
    const currentKeys = Object.keys(currentFilters);

    if (cursorKeys.length !== currentKeys.length) return false;

    return cursorKeys.every(
      (key) =>
        key in currentFilters && cursor.filters![key] === currentFilters[key]
    );
  }

  /**
   * WHERE句を構築（Prisma用）
   * codex推奨: sortKey < lastSortKey OR (sortKey = lastSortKey AND id < lastId)
   */
  buildWhereClause(
    payload: CursorPayload,
    direction: 'forward' | 'backward' = 'forward'
  ): Record<string, any> {
    const { sortBy, sortOrder, values } = payload;
    const isDesc = sortOrder === 'desc';
    const isForward = direction === 'forward';

    // ソートキーと一意キー（id）を取得
    const sortValue = values[sortBy];
    const idValue = values.id;

    if (sortValue == null || idValue == null) {
      return {};
    }

    // Forward: 次のページ
    // Backward: 前のページ
    const operator =
      (isDesc && isForward) || (!isDesc && !isForward) ? 'lt' : 'gt';

    return {
      OR: [
        {
          [sortBy]: {
            [operator]: sortValue,
          },
        },
        {
          AND: [
            {
              [sortBy]: sortValue,
            },
            {
              id: {
                [operator]: idValue,
              },
            },
          ],
        },
      ],
    };
  }

  /**
   * ページ情報を生成
   */
  generatePageInfo(
    items: any[],
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    filters?: CursorFilters,
    hasPreviousPage: boolean = false
  ): PageInfo & { items: any[] } {
    // limit+1 で取得して、次ページの存在を判定
    const hasNextPage = items.length > limit;
    const pageItems = hasNextPage ? items.slice(0, limit) : items;

    const pageInfo: PageInfo = {
      hasNextPage,
      hasPreviousPage,
    };

    if (pageItems.length > 0) {
      // 最初と最後のアイテムからカーソルを生成
      const firstItem = pageItems[0];
      const lastItem = pageItems[pageItems.length - 1];

      pageInfo.startCursor = this.encodeCursor({
        sortBy,
        sortOrder,
        values: {
          [sortBy]: firstItem[sortBy],
          id: firstItem.id,
        },
        limit,
        filters,
      });

      pageInfo.endCursor = this.encodeCursor({
        sortBy,
        sortOrder,
        values: {
          [sortBy]: lastItem[sortBy],
          id: lastItem.id,
        },
        limit,
        filters,
      });
    }

    return {
      items: pageItems,
      ...pageInfo,
    };
  }
}

/**
 * グローバルインスタンス（シングルトン）
 */
let globalCursorManager: CursorManager | null = null;

/**
 * カーソルマネージャーを取得
 */
export function getCursorManager(): CursorManager {
  if (!globalCursorManager) {
    const secret =
      env.CURSOR_SECRET || 'default-secret-change-in-production';

    // 本番環境でデフォルト秘密鍵の使用を禁止（CI/テスト環境は除外）
    const allowInsecureCursorSecret =
      env.CI === 'true' ||
      env.ALLOW_INSECURE_CURSOR_SECRET === 'true';

    if (
      process.env.NODE_ENV === 'production' &&
      !allowInsecureCursorSecret &&
      secret === 'default-secret-change-in-production'
    ) {
      throw new Error('CURSOR_SECRET is required in production');
    }

    globalCursorManager = new CursorManager({
      secret,
      maxAge: 3600, // 1時間
      version: 2, // セキュリティ強化版
    });
  }

  return globalCursorManager;
}

/**
 * カーソルマネージャーをリセット（テスト用）
 */
export function resetCursorManager(): void {
  globalCursorManager = null;
}
