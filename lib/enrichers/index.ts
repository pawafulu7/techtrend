/**
 * Content Enricher Factory
 * URLに応じて適切なエンリッチャーを選択
 */

import { IContentEnricher } from './base';
import { GMOContentEnricher } from './gmo';
import { FreeeContentEnricher } from './freee';

export { IContentEnricher, BaseContentEnricher } from './base';
export { GMOContentEnricher } from './gmo';
export { FreeeContentEnricher } from './freee';

/**
 * エンリッチャーファクトリークラス
 * URLに基づいて適切なエンリッチャーを返す
 */
export class ContentEnricherFactory {
  private enrichers: IContentEnricher[];

  constructor() {
    // 利用可能なエンリッチャーを登録
    this.enrichers = [
      new GMOContentEnricher(),
      new FreeeContentEnricher(),
      // 将来的に他の企業のエンリッチャーを追加
      // new CookpadContentEnricher(),
      // new SmartHRContentEnricher(),
    ];
  }

  /**
   * URLに対応するエンリッチャーを取得
   * @param url 処理対象のURL
   * @returns 対応するエンリッチャー、またはnull
   */
  getEnricher(url: string): IContentEnricher | null {
    const enricher = this.enrichers.find(e => e.canHandle(url));
    
    if (enricher) {
      console.log(`[EnricherFactory] Found enricher for ${url}: ${enricher.constructor.name}`);
    } else {
      console.log(`[EnricherFactory] No enricher found for ${url}`);
    }
    
    return enricher || null;
  }

  /**
   * 利用可能なエンリッチャーの数を取得
   */
  getEnricherCount(): number {
    return this.enrichers.length;
  }

  /**
   * サポートされているドメインのリストを取得
   */
  getSupportedDomains(): string[] {
    return [
      'developers.gmo.jp',
      'developers.freee.co.jp',
      // 'techlife.cookpad.com',
      // 'tech.smarthr.jp',
    ];
  }
}