import { Source, SourceType } from '@prisma/client';
import { BaseFetcher } from './base';
import { HatenaFetcher } from './hatena';
import { HatenaExtendedFetcher } from './hatena-extended';
import { QiitaFetcher } from './qiita';
import { ZennFetcher } from './zenn';
import { DevToFetcher } from './devto';
import { PublickeyFetcher } from './publickey';
import { TechCrunchFetcher } from './techcrunch';
import { ConnpassFetcher } from './connpass';
import { StackOverflowBlogFetcher } from './stackoverflow-blog';
import { InfoQJapanFetcher } from './infoq-japan';
import { ThinkITFetcher } from './thinkit';

export function createFetcher(source: Source): BaseFetcher {
  switch (source.name) {
    case 'はてなブックマーク':
      return new HatenaExtendedFetcher(source);
    case 'Qiita':
      return new QiitaFetcher(source);
    case 'Zenn':
      return new ZennFetcher(source);
    case 'Dev.to':
      return new DevToFetcher(source);
    case 'Publickey':
      return new PublickeyFetcher(source);
    case 'TechCrunch Japan':
      return new TechCrunchFetcher(source);
    case 'connpass':
      return new ConnpassFetcher(source);
    case 'Stack Overflow Blog':
      return new StackOverflowBlogFetcher(source);
    case 'InfoQ Japan':
      return new InfoQJapanFetcher(source);
    case 'Think IT':
      return new ThinkITFetcher(source);
    default:
      throw new Error(`Unsupported source: ${source.name}`);
  }
}

export { 
  BaseFetcher, 
  HatenaFetcher, 
  HatenaExtendedFetcher, 
  QiitaFetcher, 
  ZennFetcher, 
  DevToFetcher,
  PublickeyFetcher,
  TechCrunchFetcher,
  ConnpassFetcher,
  StackOverflowBlogFetcher,
  InfoQJapanFetcher,
  ThinkITFetcher
};
export type { FetchResult } from './base';