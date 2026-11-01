/**
 * 海外の技術ブログ（GenericForeignRssFetcher で収集するソース）の設定
 *
 * ソース名ごとのフィードの URL と、絞り込み・本文の扱いの設定を持つ。
 * フェッチャーの実装は lib/fetchers/generic-foreign-rss.ts。
 */

import { HUGGINGFACE_PAPERS_SOURCE_NAME } from '@/lib/sources/source-categories';

// ソース設定の型
export interface ForeignSourceConfig {
  feedUrl: string;
  // オプション: ソース固有のタグプレフィックス
  tagPrefix?: string;
  categoryFilter?: string[];
  /**
   * 記事URLをトラッキングパラメータ除去後の正規化URLで保存する。
   *
   * フィードが `?utm_source=feed` 等を付与するソース向け。既存レコードが
   * 生URLで保存されている既存ソースに後から有効化すると、同一記事が別URLで
   * 重複作成されるため、レコードを持たない新規ソースでのみ有効化すること。
   */
  useNormalizedUrl?: boolean;
  /**
   * フィードの description/content をコンテンツ抽出時に無視し、常に空文字を返す。
   *
   * description がコメントリンク等のノイズのみのソース向け。空文字を返すことで
   * 保存時 content が空となり、保存後エンリッチメントが記事本文を取得する
   * （エンリッチメント経路に本文取得を委ねる）。
   */
  ignoreFeedContent?: boolean;
  /**
   * enricher による本文上書きを行わないソース。
   *
   * リバーページ等、記事単位の本文が取得できず、enricher による抽出結果が
   * ノイズ（広告含む）になるソース向け。`isEnrichmentSkipped()` で参照する。
   */
  skipEnrichment?: boolean;
  /**
   * 記事URLのパス前方一致で item を絞り込む。
   *
   * 1つのフィードにブログ記事と別種のエントリ（製品チェンジログ等）が混在し、
   * かつ category による判別ができないソース向け。
   *
   * 設定値は先頭スラッシュを含むパス prefix（例: `/blog/`）。解決後 pathname に
   * 対する `startsWith` 判定のため、`/blog/` は `/blogger` に一致せず、
   * 末尾スラッシュなしの `/blog` 単体も除外する。
   *
   * `categoryFilter` と異なり `slice()` の**前**に全 item へ適用する
   * （フィード先頭が対象外パスで占められるソースで取りこぼさないため）。
   */
  urlPathFilter?: string;
}

/**
 * Phase 1 ソース設定
 * 大手テック企業のエンジニアリングブログ
 */
export const FOREIGN_SOURCE_CONFIGS: Record<string, ForeignSourceConfig> = {
  // Phase 1: 大手テック企業エンジニアリングブログ
  'Meta Engineering': {
    feedUrl: 'https://engineering.fb.com/feed/',
    tagPrefix: 'Meta',
  },
  'Netflix TechBlog': {
    feedUrl: 'https://netflixtechblog.medium.com/feed',
    tagPrefix: 'Netflix',
  },
  'Spotify Engineering': {
    feedUrl: 'https://engineering.atspotify.com/feed/',
    tagPrefix: 'Spotify',
  },
  'Pinterest Engineering': {
    feedUrl: 'https://medium.com/feed/pinterest-engineering',
    tagPrefix: 'Pinterest',
  },
  // Phase 2: 大手テック企業
  'Stripe Engineering': {
    feedUrl: 'https://stripe.com/blog/feed.rss',
    tagPrefix: 'Stripe',
  },
  'Discord Engineering': {
    feedUrl: 'https://discord.com/blog/rss.xml',
    tagPrefix: 'Discord',
  },
  'Slack Engineering': {
    feedUrl: 'https://slack.engineering/feed/',
    tagPrefix: 'Slack',
  },
  // Phase 2: クラウドネイティブ・Web
  'The New Stack': {
    feedUrl: 'https://thenewstack.io/feed/',
    tagPrefix: 'CloudNative',
  },
  'CNCF Blog': {
    feedUrl: 'https://www.cncf.io/feed/',
    tagPrefix: 'CNCF',
  },
  'Kubernetes Blog': {
    feedUrl: 'https://kubernetes.io/feed.xml',
    tagPrefix: 'Kubernetes',
  },
  'Chrome Developers': {
    feedUrl: 'https://developer.chrome.com/blog/feed.xml',
    tagPrefix: 'Chrome',
  },
  // Phase 2: 言語公式ブログ
  'Go Blog': {
    feedUrl: 'https://go.dev/blog/feed.atom',
    tagPrefix: 'Go',
  },
  'Rust Blog': {
    feedUrl: 'https://blog.rust-lang.org/feed.xml',
    tagPrefix: 'Rust',
  },
  // Japanese Tech Media
  'ITmedia Security': {
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/news_security.xml',
    tagPrefix: 'itmedia-security',
  },
  'ITmedia AI+': {
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml',
    tagPrefix: 'itmedia-ai',
  },
  '@IT': {
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/ait.xml',
    tagPrefix: 'atit',
  },
  // Business Media
  'Business Insider': {
    feedUrl: 'https://feeds.businessinsider.com/custom/all',
    tagPrefix: 'BusinessInsider',
    categoryFilter: ['Tech', 'AI'],
  },
  // Japanese Tech Media (Batch 1, Issue #628)
  // 4ソースとも新規のため useNormalizedUrl を有効化する。gihyo.jp / Findy は
  // フィードが ?utm_source=feed を付与しており、既にはてなブックマーク経由で
  // 収集済みの同一記事（正規URL）と重複するため
  'JSer.info': {
    feedUrl: 'https://jser.info/rss/',
    tagPrefix: 'jser',
    useNormalizedUrl: true,
  },
  CodeZine: {
    feedUrl: 'https://codezine.jp/rss/new/20/index.xml',
    tagPrefix: 'codezine',
    useNormalizedUrl: true,
  },
  'gihyo.jp': {
    feedUrl: 'https://gihyo.jp/feed/rss2',
    tagPrefix: 'gihyo',
    useNormalizedUrl: true,
  },
  'Findy Engineer Lab': {
    feedUrl: 'https://engineer-lab.findy-code.io/feed',
    tagPrefix: 'findy-engineer-lab',
    useNormalizedUrl: true,
  },
  // Foreign Aggregators (Batch 2, Issue #628)
  // Lobsters: item link が外部記事URL（Hacker News と同型のアグリゲータ）。
  // HN が生URL保存のため useNormalizedUrl は有効化しない（正規化すると HN 既存記事
  // とのURL照合が崩れて重複作成される。plan_20260802_221749 §4.2 参照）。
  // description は Comments リンクのみのため ignoreFeedContent で本文を
  // エンリッチメントに委ねる
  Lobsters: {
    feedUrl: 'https://lobste.rs/rss',
    tagPrefix: 'lobsters',
    ignoreFeedContent: true,
  },
  // Techmeme: item link が自サイトのリバーページ・パーマリンク（#アンカー付き）。
  // enricher はリバーページ全体（広告含む）を抽出してしまうため skipEnrichment で
  // description 由来の見出し本文を維持する
  Techmeme: {
    feedUrl: 'https://www.techmeme.com/feed.xml',
    tagPrefix: 'techmeme',
    useNormalizedUrl: true,
    skipEnrichment: true,
  },
  // Foreign Company / Product Blogs (Batch 3, Issue #628)
  // useNormalizedUrl は「新規ソースなら常に有効化」ではなく、既存レコードの
  // 保存URL形式に合わせる（重複判定は保存URL文字列の完全一致のため）。
  // 既存が末尾スラッシュ付きの生URLで保存されているソースで有効化すると、
  // normalizeUrl() の末尾スラッシュ除去により照合が崩れて重複作成される
  //
  // Vercel: フィード（/atom）に blog と changelog が混在し Atom category も
  // 持たないため、categoryFilter ではなく urlPathFilter で /blog/ に絞る
  'Vercel Blog': {
    feedUrl: 'https://vercel.com/atom',
    tagPrefix: 'vercel',
    useNormalizedUrl: true,
    urlPathFilter: '/blog/',
  },
  // TypeScript: Hacker News / はてなブックマーク経由の既存記事が
  // 末尾スラッシュ付きの生URLで保存済みのため useNormalizedUrl は有効化しない
  'TypeScript Blog': {
    feedUrl: 'https://devblogs.microsoft.com/typescript/feed/',
    tagPrefix: 'typescript',
  },
  // VS Code: Atom category term が blog / release に分かれる。リリースノートは
  // 本文がリンクのみで記事性が薄いため blog のみ収集する
  'VS Code Blog': {
    feedUrl: 'https://code.visualstudio.com/feed.xml',
    tagPrefix: 'vscode',
    useNormalizedUrl: true,
    categoryFilter: ['blog'],
  },
  'Dropbox Tech': {
    feedUrl: 'https://dropbox.tech/feed',
    tagPrefix: 'dropbox',
    useNormalizedUrl: true,
  },
  // Fly.io: Hacker News 経由の既存記事が末尾スラッシュ付きの生URLで保存済みの
  // ため useNormalizedUrl は有効化しない（TypeScript Blog と同じ理由）
  'Fly.io Blog': {
    feedUrl: 'https://fly.io/blog/feed.xml',
    tagPrefix: 'flyio',
  },
};

/**
 * ソース名からForeignSourceConfigを取得するヘルパー
 */
export function getForeignSourceConfig(
  sourceName: string
): ForeignSourceConfig | undefined {
  return FOREIGN_SOURCE_CONFIGS[sourceName];
}

/**
 * FOREIGN_SOURCE_CONFIGS 以外で、enricher による本文上書きを行わないソース。
 * Hugging Face Papers は API の要旨を本文にする（汎用 enricher は arXiv のページを
 * 取りに行き、長ければ本文を上書きしてしまう）。
 */
const ENRICHMENT_SKIPPED_SOURCE_NAMES = new Set([HUGGINGFACE_PAPERS_SOURCE_NAME]);

/**
 * 指定ソースが enricher による本文上書きをスキップする対象かどうかを判定する
 * （純粋関数）。collect-feeds.ts / enrich-thin-content.ts 等、enricher で
 * 記事本文を上書きする全経路から参照すること。
 */
export function isEnrichmentSkipped(sourceName: string): boolean {
  return (
    FOREIGN_SOURCE_CONFIGS[sourceName]?.skipEnrichment === true ||
    ENRICHMENT_SKIPPED_SOURCE_NAMES.has(sourceName)
  );
}
