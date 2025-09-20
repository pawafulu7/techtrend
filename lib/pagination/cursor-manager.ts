/**
 * Cursor-based Pagination Manager
 * codex推奨: セキュアで効率的なカーソル実装
 */

import { createHmac, randomBytes } from 'crypto';
import logger from '@/lib/logger';

/**
 * カーソルペイロードの型定義
 */
export interface CursorPayload {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  values: Record<string, any>;
  limit: number;
  filters?: Record<string, any>;
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
  maxAge?: number;  // カーソルの有効期限（秒）
  version?: number;  // カーソルスキーマバージョン
}

/**
 * カーソルベースページネーションマネージャー
 */
export class CursorManager {
  private secret: string;
  private maxAge: number;
  private version: number;

  constructor(config: CursorManagerConfig) {
    this.secret = config.secret || process.env.CURSOR_SECRET || randomBytes(32).toString('hex');
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
      const base64 = cursor
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padding = '='.repeat((4 - base64.length % 4) % 4);
      const signedPayload = Buffer.from(base64 + padding, 'base64').toString();

      const [signature, jsonStr] = signedPayload.split('.');
      if (!signature || !jsonStr) {
        logger.warn('cursor-manager.invalid-format');
        return null;
      }

      // 署名検証
      const expectedSignature = this.generateSignature(jsonStr);
      if (signature !== expectedSignature) {
        logger.warn('cursor-manager.invalid-signature');
        return null;
      }

      const payload: CursorPayload = JSON.parse(jsonStr);

      // バージョンチェック
      if (payload.version !== this.version) {
        logger.warn(`cursor-manager.version-mismatch: expected=${this.version}, got=${payload.version}`);
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
   * HMAC署名を生成
   */
  private generateSignature(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('hex')
      .substring(0, 16); // 短縮版（16文字）
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
    return cursor.sortBy === currentSortBy && cursor.sortOrder === currentSortOrder;
  }

  /**
   * フィルター条件の一致を検証（オプション）
   */
  validateFilters(cursor: CursorPayload, currentFilters: Record<string, any>): boolean {
    if (!cursor.filters && !currentFilters) {
      return true;
    }

    if (!cursor.filters || !currentFilters) {
      return false;
    }

    // 簡易的な比較（深い比較が必要な場合は別途実装）
    const cursorFilterStr = JSON.stringify(cursor.filters);
    const currentFilterStr = JSON.stringify(currentFilters);

    return cursorFilterStr === currentFilterStr;
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

    if (!sortValue || !idValue) {
      return {};
    }

    // Forward: 次のページ
    // Backward: 前のページ
    const operator = (isDesc && isForward) || (!isDesc && !isForward) ? 'lt' : 'gt';

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
    filters?: Record<string, any>,
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
    globalCursorManager = new CursorManager({
      secret: process.env.CURSOR_SECRET || 'default-secret-change-in-production',
      maxAge: 3600, // 1時間
      version: 1,
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