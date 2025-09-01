/**
 * Content Enricher Factory
 * URLに応じて適切なエンリッチャーを選択
 */

import { IContentEnricher } from './base';
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
import { ZOZOContentEnricher } from './zozo';
import { RecruitContentEnricher } from './recruit';
import { HatenaDeveloperContentEnricher } from './hatena-developer';
import { PepaboContentEnricher } from './pepabo';
import { SansanContentEnricher } from './sansan';
import { MoneyForwardContentEnricher } from './moneyforward';
import { GitHubBlogEnricher } from './github-blog';
import { CloudflareBlogEnricher } from './cloudflare-blog';
import { MozillaHacksEnricher } from './mozilla-hacks';
import { HackerNewsEnricher } from './hacker-news';
import { MediumEngineeringEnricher } from './medium-engineering';
import { AWSEnricher } from './aws';

export { BaseContentEnricher } from './base';
export type { IContentEnricher, EnrichedContent, EnrichmentResult } from './base';
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
export { ZOZOContentEnricher } from './zozo';
export { RecruitContentEnricher } from './recruit';
export { HatenaDeveloperContentEnricher } from './hatena-developer';
export { PepaboContentEnricher } from './pepabo';
export { SansanContentEnricher } from './sansan';
export { MoneyForwardContentEnricher } from './moneyforward';
export { GitHubBlogEnricher } from './github-blog';
export { CloudflareBlogEnricher } from './cloudflare-blog';
export { MozillaHacksEnricher } from './mozilla-hacks';
export { HackerNewsEnricher } from './hacker-news';
export { MediumEngineeringEnricher } from './medium-engineering';
export { AWSEnricher } from './aws';

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
      // 新規追加（2025年8月14日）
      new ZOZOContentEnricher(),
      new RecruitContentEnricher(),
      new HatenaDeveloperContentEnricher(),
      new PepaboContentEnricher(),
      new SansanContentEnricher(),
      new MoneyForwardContentEnricher(),
      // 新規追加（2025年8月27日）英語ソース
      new GitHubBlogEnricher(),
      new CloudflareBlogEnricher(),
      new MozillaHacksEnricher(),
      new HackerNewsEnricher(),
      new MediumEngineeringEnricher(),
      // 新規追加（2025年9月2日）AWSソース
      new AWSEnricher(),
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
    } else {
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
