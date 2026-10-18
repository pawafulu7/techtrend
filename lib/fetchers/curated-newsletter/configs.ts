/**
 * 分野のニュースレター（編集者が毎週選んだ記事）の設定
 *
 * 号の HTML から選ばれた記事を1本ずつ取り出して、記事として保存する（index.ts）。
 * name は Source.name・createFetcher の case・ワークフローの引数と、sourceId は
 * Source.id・SOURCE_CATEGORIES と一致させる（__tests__/fetchers/newsletter-sources.test.ts が検査する）。
 */

/** 号の HTML の形式 */
export type NewsletterFormat =
  'cooperpress' | 'sre-weekly' | 'data-engineering-weekly';

export interface NewsletterConfig {
  name: string;
  sourceId: string;
  feedUrl: string;
  format: NewsletterFormat;
  /** Cooperpress の記事リンクの転送ホスト（`<オリジン>/link/<数字>/rss`）。ここにだけ問い合わせる */
  redirectOrigin?: string;
  /** 自誌のホスト。記事の URL がここなら保存しない（下位ドメインを含む） */
  ownHosts: readonly string[];
  /** 保存する記事に付けるタグ */
  tags: readonly string[];
}

// Cooperpress の各誌は互いの宣伝を載せるので、どの誌でも Cooperpress のホストはすべて自誌とみなす
const COOPERPRESS_HOSTS = [
  'javascriptweekly.com',
  'frontendfoc.us',
  'statuscode.com',
  'nodeweekly.com',
  'postgresweekly.com',
  'golangweekly.com',
  'rubyweekly.com',
  'cooperpress.com',
] as const;

export const CURATED_NEWSLETTER_CONFIGS: Record<string, NewsletterConfig> = {
  'JavaScript Weekly': {
    name: 'JavaScript Weekly',
    sourceId: 'javascript_weekly',
    feedUrl: 'https://cprss.s3.amazonaws.com/javascriptweekly.com.xml',
    format: 'cooperpress',
    redirectOrigin: 'https://javascriptweekly.com',
    ownHosts: COOPERPRESS_HOSTS,
    tags: ['JavaScript'],
  },
  'Frontend Focus': {
    name: 'Frontend Focus',
    sourceId: 'frontend_focus',
    feedUrl: 'https://cprss.s3.amazonaws.com/frontendfoc.us.xml',
    format: 'cooperpress',
    redirectOrigin: 'https://frontendfoc.us',
    ownHosts: COOPERPRESS_HOSTS,
    tags: ['Frontend'],
  },
  'React Status': {
    name: 'React Status',
    sourceId: 'react_status',
    feedUrl: 'https://cprss.s3.amazonaws.com/react.statuscode.com.xml',
    format: 'cooperpress',
    redirectOrigin: 'https://react.statuscode.com',
    ownHosts: COOPERPRESS_HOSTS,
    tags: ['React'],
  },
  'Node Weekly': {
    name: 'Node Weekly',
    sourceId: 'node_weekly',
    feedUrl: 'https://cprss.s3.amazonaws.com/nodeweekly.com.xml',
    format: 'cooperpress',
    redirectOrigin: 'https://nodeweekly.com',
    ownHosts: COOPERPRESS_HOSTS,
    tags: ['Node.js'],
  },
  'Postgres Weekly': {
    name: 'Postgres Weekly',
    sourceId: 'postgres_weekly',
    feedUrl: 'https://cprss.s3.amazonaws.com/postgresweekly.com.xml',
    format: 'cooperpress',
    redirectOrigin: 'https://postgresweekly.com',
    ownHosts: COOPERPRESS_HOSTS,
    tags: ['PostgreSQL'],
  },
  'SRE Weekly': {
    name: 'SRE Weekly',
    sourceId: 'sre_weekly',
    feedUrl: 'https://sreweekly.com/feed/',
    format: 'sre-weekly',
    ownHosts: ['sreweekly.com'],
    tags: ['SRE'],
  },
  'Data Engineering Weekly': {
    name: 'Data Engineering Weekly',
    sourceId: 'data_engineering_weekly',
    feedUrl: 'https://www.dataengineeringweekly.com/feed',
    format: 'data-engineering-weekly',
    ownHosts: ['dataengineeringweekly.com'],
    tags: ['Data Engineering'],
  },
};

/** ニュースレターのソースの id。はてなブックマークからの記事の付け替えの対象から外すのに使う */
export const CURATED_NEWSLETTER_SOURCE_IDS: ReadonlySet<string> = new Set(
  Object.values(CURATED_NEWSLETTER_CONFIGS).map((config) => config.sourceId)
);

export function getCuratedNewsletterConfig(
  name: string
): NewsletterConfig | undefined {
  return Object.hasOwn(CURATED_NEWSLETTER_CONFIGS, name)
    ? CURATED_NEWSLETTER_CONFIGS[name]
    : undefined;
}
