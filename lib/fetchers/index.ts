import { Source, SourceType } from '@prisma/client';
import { BaseFetcher } from './base';
import { HatenaFetcher } from './hatena';
import { QiitaFetcher } from './qiita';
import { ZennFetcher } from './zenn';

export function createFetcher(source: Source): BaseFetcher {
  switch (source.name) {
    case 'はてなブックマーク':
      return new HatenaFetcher(source);
    case 'Qiita':
      return new QiitaFetcher(source);
    case 'Zenn':
      return new ZennFetcher(source);
    default:
      throw new Error(`Unsupported source: ${source.name}`);
  }
}

export { BaseFetcher, HatenaFetcher, QiitaFetcher, ZennFetcher };
export type { FetchResult } from './base';