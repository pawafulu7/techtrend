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

// AI/LLM関連フェッチャー
import {
  OpenAIBlogFetcher,
  HuggingFacePapersFetcher,
  ArxivAIFetcher,
  ZennAIFetcher,
  QiitaAIFetcher,
  ClaudeBlogFetcher,
  AnthropicNewsFetcher,
} from './ai';
import { NVIDIADeveloperBlogFetcher } from './nvidia-developer-blog';
import { DeepMindBlogFetcher } from './deepmind-blog';
import { HatenaBlogDevFetcher } from './hatena-blog-dev';
import { ForbesJapanFetcher } from './forbes-japan';
import { DevelopersIOFetcher, getTagFromSourceName } from './developersio';

// Foreign Tech Company Blog Fetchers
import {
  GenericForeignRssFetcher,
  getForeignSourceConfig,
} from './generic-foreign-rss';

// Japanese Corporate Tech Blog Fetchers
import { DeNAFetcher } from './corporate-blogs/dena-fetcher';
import { SmartHRFetcher } from './corporate-blogs/smarthr-fetcher';
import { LYCorpFetcher } from './corporate-blogs/lycorp-fetcher';
import { MercariFetcher } from './corporate-blogs/mercari-fetcher';
import { SansanFetcher } from './corporate-blogs/sansan-fetcher';
import { ZOZOFetcher } from './corporate-blogs/zozo-fetcher';
import { HatenaFetcher } from './corporate-blogs/hatena-fetcher';
import { MoneyForwardFetcher } from './corporate-blogs/moneyforward-fetcher';
import { PepaboFetcher } from './corporate-blogs/pepabo-fetcher';
import { FreeeFetcher } from './corporate-blogs/freee-fetcher';
import { CookpadFetcher } from './corporate-blogs/cookpad-fetcher';
import { CyberAgentFetcher } from './corporate-blogs/cyberagent-fetcher';
import { GMOFetcher } from './corporate-blogs/gmo-fetcher';

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

    // AI/LLM関連ソース
    case 'OpenAI Blog':
      return new OpenAIBlogFetcher(source);
    case 'Hugging Face Papers':
      return new HuggingFacePapersFetcher(source);
    case 'arXiv AI':
      return new ArxivAIFetcher(source);
    case 'Zenn AI':
      return new ZennAIFetcher(source);
    case 'Qiita AI':
      return new QiitaAIFetcher(source);
    case 'Claude Blog':
      return new ClaudeBlogFetcher(source);
    case 'Anthropic News':
      return new AnthropicNewsFetcher(source);
    case 'NVIDIA Developer Blog':
      return new NVIDIADeveloperBlogFetcher(source);
    case 'DeepMind Blog':
      return new DeepMindBlogFetcher(source);
    case '企業技術ブログ':
      return new HatenaBlogDevFetcher(source);
    case 'Forbes Japan AI':
      return new ForbesJapanFetcher(source);

    // Japanese Corporate Tech Blogs
    case 'DeNA Engineering':
      return new DeNAFetcher(source);
    case 'SmartHR Tech Blog':
      return new SmartHRFetcher(source);
    case 'LY Corporation Tech Blog':
      return new LYCorpFetcher(source);
    case 'Mercari Engineering':
      return new MercariFetcher(source);
    case 'Sansan Builders Box':
      return new SansanFetcher(source);
    case 'ZOZO TECH BLOG':
      return new ZOZOFetcher(source);
    case 'Hatena Developer Blog':
      return new HatenaFetcher(source);
    case 'Money Forward Developers Blog':
      return new MoneyForwardFetcher(source);
    case 'ペパボテックブログ':
      return new PepaboFetcher(source);
    case 'freee Developers Hub':
      return new FreeeFetcher(source);
    case 'Cookpad Tech Life':
      return new CookpadFetcher(source);
    case 'CyberAgent Developers Blog':
      return new CyberAgentFetcher(source);
    case 'GMO Developers':
      return new GMOFetcher(source);

    // DevelopersIO (dev.classmethod.jp) tag-based sources
    case 'DevelopersIO AWS':
    case 'DevelopersIO AI':
    case 'DevelopersIO Claude':
    case 'DevelopersIO MCP':
    case 'DevelopersIO Security': {
      const tag = getTagFromSourceName(source.name);
      if (!tag) {
        throw new Error(`Invalid DevelopersIO source name: ${source.name}`);
      }
      return new DevelopersIOFetcher(source, tag);
    }

    // Foreign Tech Company Engineering Blogs (Phase 1)
    case 'Meta Engineering':
    case 'Netflix TechBlog':
    case 'Spotify Engineering':
    case 'Pinterest Engineering':
    // Foreign Tech Company Engineering Blogs (Phase 2)
    case 'Stripe Engineering':
    case 'Discord Engineering':
    case 'Slack Engineering':
    case 'The New Stack':
    case 'CNCF Blog':
    case 'Chrome Developers':
    case 'Kubernetes Blog':
    case 'Go Blog':
    case 'Rust Blog':
    // Japanese Tech Media
    case 'ITmedia Security':
    case 'ITmedia AI+':
    case '@IT': {
      const foreignConfig = getForeignSourceConfig(source.name);
      if (!foreignConfig) {
        throw new Error(`Invalid foreign source name: ${source.name}`);
      }
      return new GenericForeignRssFetcher(source, foreignConfig);
    }

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
  MediumEngineeringFetcher,
  // MicrosoftDevBlogFetcher
  OpenAIBlogFetcher,
  HuggingFacePapersFetcher,
  ArxivAIFetcher,
  ZennAIFetcher,
  QiitaAIFetcher,
  NVIDIADeveloperBlogFetcher,
  DeepMindBlogFetcher,
  HatenaBlogDevFetcher,
  DevelopersIOFetcher,
  GenericForeignRssFetcher,
  ForbesJapanFetcher,
};
export type { FetchResult } from '@/types/fetchers';
