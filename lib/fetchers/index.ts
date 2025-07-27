import { Source, SourceType } from '@prisma/client';
import { BaseFetcher } from './base';
import { HatenaExtendedFetcher } from './hatena-extended';
import { QiitaPopularFetcher } from './qiita-popular';
import { ZennExtendedFetcher } from './zenn-extended';
import { DevToFetcher } from './devto';
import { PublickeyFetcher } from './publickey';
import { StackOverflowBlogFetcher } from './stackoverflow-blog';
import { ThinkITFetcher } from './thinkit';
import { SpeakerDeckFetcher } from './speakerdeck';
import { RailsReleasesFetcher } from './rails-releases';
import { AWSFetcher } from './aws';

export function createFetcher(source: Source): BaseFetcher {
  switch (source.name) {
    case 'はてなブックマーク':
      return new HatenaExtendedFetcher(source);
    case 'Qiita Popular':
      return new QiitaPopularFetcher(source);
    case 'Zenn':
      return new ZennExtendedFetcher(source);
    case 'Dev.to':
      return new DevToFetcher(source);
    case 'Publickey':
      return new PublickeyFetcher(source);
    case 'Stack Overflow Blog':
      return new StackOverflowBlogFetcher(source);
    case 'Think IT':
      return new ThinkITFetcher(source);
    case 'Speaker Deck':
      return new SpeakerDeckFetcher(source);
    case 'Rails Releases':
      return new RailsReleasesFetcher(source);
    case 'AWS Security Bulletins':
    case 'AWS What\'s New':
    case 'AWS News Blog':
      return new AWSFetcher(source);
    default:
      throw new Error(`Unsupported source: ${source.name}`);
  }
}

export { 
  BaseFetcher, 
  HatenaExtendedFetcher, 
  QiitaPopularFetcher, 
  ZennExtendedFetcher, 
  DevToFetcher,
  PublickeyFetcher,
  StackOverflowBlogFetcher,
  ThinkITFetcher,
  SpeakerDeckFetcher,
  RailsReleasesFetcher,
  AWSFetcher
};
export type { FetchResult } from './base';