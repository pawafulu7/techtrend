import { Source } from '@prisma/client';
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
import { SREFetcher } from './sre';
import { GoogleDevBlogFetcher } from './google-dev-blog';
import { CorporateTechBlogFetcher } from './corporate-tech-blog';
import { HuggingFaceFetcher } from './huggingface';
import { GoogleAIFetcher } from './google-ai';
import { InfoQJapanFetcher } from './infoq-japan';
import { DocswellFetcher } from './docswell';
import { GitHubBlogFetcher } from './github-blog';
import { CloudflareBlogFetcher } from './cloudflare-blog';
import { MozillaHacksFetcher } from './mozilla-hacks';
import { HackerNewsFetcher } from './hacker-news';
import { MediumEngineeringFetcher } from './medium-engineering';
// import { MicrosoftDevBlogFetcher } from './microsoft-dev-blog';

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
    case 'AWS':
      return new AWSFetcher(source);
    case 'SRE':
      return new SREFetcher(source);
    case 'Google Developers Blog':
      return new GoogleDevBlogFetcher(source);
    case 'Corporate Tech Blog':
      return new CorporateTechBlogFetcher(source);
    case 'Hugging Face Blog':
      return new HuggingFaceFetcher(source);
    case 'Google AI Blog':
      return new GoogleAIFetcher(source);
    case 'InfoQ Japan':
      return new InfoQJapanFetcher(source);
    case 'Docswell':
      return new DocswellFetcher(source);
    case 'GitHub Blog':
      return new GitHubBlogFetcher(source);
    case 'Cloudflare Blog':
      return new CloudflareBlogFetcher(source);
    case 'Mozilla Hacks':
      return new MozillaHacksFetcher(source);
    case 'Hacker News':
      return new HackerNewsFetcher(source);
    case 'Medium Engineering':
      return new MediumEngineeringFetcher(source);
    // case 'Microsoft Developer Blog':
    //   return new MicrosoftDevBlogFetcher(source);
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
  AWSFetcher,
  SREFetcher,
  GoogleDevBlogFetcher,
  CorporateTechBlogFetcher,
  HuggingFaceFetcher,
  GoogleAIFetcher,
  InfoQJapanFetcher,
  DocswellFetcher,
  GitHubBlogFetcher,
  CloudflareBlogFetcher,
  MozillaHacksFetcher,
  HackerNewsFetcher,
  MediumEngineeringFetcher
  // MicrosoftDevBlogFetcher
};
export type { FetchResult } from './base';