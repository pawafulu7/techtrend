/**
 * Content Enricher Factory
 * URLに応じて適切なエンリッチャーを選択
 */

import { IContentEnricher, EnrichedContent } from './base';
import { GMOContentEnricher } from './gmo';
import { FreeeContentEnricher } from './freee';
import { HatenaContentEnricher } from './hatena';
import { ZennContentEnricher } from './zenn';
import { ThinkITContentEnricher } from './thinkit';
import { GoogleAIEnricher } from './google-ai';
import { GoogleDevEnricher } from './google-dev';
import { HuggingFaceEnricher } from './huggingface';
import { InfoQEnricher } from './infoq';
import { PublickeyEnricher } from './publickey';
import { StackOverflowEnricher } from './stackoverflow';

export { IContentEnricher, BaseContentEnricher, EnrichedContent } from './base';
export { GMOContentEnricher } from './gmo';
export { FreeeContentEnricher } from './freee';
export { HatenaContentEnricher } from './hatena';
export { ZennContentEnricher } from './zenn';
export { ThinkITContentEnricher } from './thinkit';
export { GoogleAIEnricher } from './google-ai';
export { GoogleDevEnricher } from './google-dev';
export { HuggingFaceEnricher } from './huggingface';
export { InfoQEnricher } from './infoq';
export { PublickeyEnricher } from './publickey';
export { StackOverflowEnricher } from './stackoverflow';

/**
 * エンリッチャーファクトリークラス
 * URLに基づいて適切なエンリッチャーを返す
 */
export class ContentEnricherFactory {
  private enrichers: IContentEnricher[];

  constructor() {
    // 利用可能なエンリッチャーを登録
    // 注意: 順序が重要（特定のエンリッチャーを優先）
    this.enrichers = [
      new GMOContentEnricher(),
      new FreeeContentEnricher(),
      new ZennContentEnricher(),
      new ThinkITContentEnricher(),
      new GoogleAIEnricher(),
      new GoogleDevEnricher(),
      new HuggingFaceEnricher(),
      new InfoQEnricher(),
      new PublickeyEnricher(),
      new StackOverflowEnricher(),
      new HatenaContentEnricher(),  // 最後（すべてのURLに対応するため）
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
      'zenn.dev',
      'thinkit.co.jp',
      '*', // HatenaContentEnricherはすべてのURLに対応
      // 'techlife.cookpad.com',
      // 'tech.smarthr.jp',
    ];
  }
}