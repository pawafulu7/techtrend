import { Source } from '@/lib/prisma-exports';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import logger from '@/lib/logger';

/**
 * Hugging Face Daily Papers の fetcher。
 *
 * Hugging Face の API（/api/daily_papers）から、直近 3 日（前日・2日前・3日前、UTC）に Daily Papers に
 * 載った論文を取る。当日の一覧は upvotes が動いて毎時入れ替わるので使わない。前の日を毎回取り直すので、
 * ある日の取得に失敗しても次の実行で取り戻せる（重複は URL の完全一致で保存されない）。
 * 1回の取得では、日ごとに arXiv の公開が 7 日以内の論文に絞ってから、upvotes の多い順に 30 件まで取る。
 * 同じ日を後の実行で取り直すと upvotes の順位が動くので、1日あたり 30 件は目安で厳密な上限ではない。
 * 以前の取得先（公開の RSSHub）は 403 を返し、2025-11 から止まっていた。
 */
const API_URL = 'https://huggingface.co/api/daily_papers';
const DAYS_TO_FETCH = 3;
const MAX_PAPERS_PER_DAY = 30;
const MAX_PAPER_AGE_DAYS = 7;
/** 1ページの件数。limit を付けないと 50 件で切られる */
const PAGE_LIMIT = 100;
const MAX_PAGES = 3;
/**
 * 1リクエストの期限（JSON の読み取りまで含む）。日は並行に、ページは順に取るので、最悪でも
 * 3 ページ × 10 秒で、収集のソースごとの期限（既定 120 秒）に収まる
 */
const REQUEST_TIMEOUT_MS = 10_000;
const ARXIV_ID_PATTERN = /^\d{4}\.\d{4,5}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

interface PaperCandidate {
  arxivId: string;
  title: string;
  abstract: string;
  publishedAt: Date;
  upvotes: number;
  authors: string[];
}

export class HuggingFacePapersFetcher extends BaseFetcher {
  constructor(
    source: Source,
    private readonly now: () => Date = () => new Date()
  ) {
    super(source);
  }

  async fetch(): Promise<FetchResult> {
    const now = this.now();
    const dates = Array.from({ length: DAYS_TO_FETCH }, (_, i) =>
      toUtcDateString(new Date(now.getTime() - (i + 1) * DAY_MS))
    );

    const results = await Promise.allSettled(
      dates.map((date) => this.fetchDay(date, now))
    );

    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        articles.push(...result.value.articles);
        if (result.value.invalidCount > 0) {
          errors.push(
            new Error(
              `Hugging Face Daily Papers (${dates[i]}): 必須の項目が無い論文 ${result.value.invalidCount} 件を飛ばした`
            )
          );
        }
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        errors.push(
          new Error(
            `Hugging Face Daily Papers取得エラー (${dates[i]}): ${message}`
          )
        );
      }
    });

    logger.info(
      `Hugging Face Daily Papers: ${articles.length}件の記事を取得（${dates.join(', ')}）`
    );
    return { articles, errors };
  }

  private async fetchDay(
    date: string,
    now: Date
  ): Promise<{ articles: CreateArticleInput[]; invalidCount: number }> {
    const items: unknown[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const pageItems = await fetchPage(date, page);
      items.push(...pageItems);
      if (pageItems.length < PAGE_LIMIT) break;
    }

    // ページを順に取る間に順位が動くと、同じ論文が2つのページに出ることがある
    const candidates = new Map<string, PaperCandidate>();
    let invalidCount = 0;
    for (const item of items) {
      const candidate = toCandidate(item);
      if (candidate) {
        candidates.set(candidate.arxivId, candidate);
      } else {
        invalidCount++;
      }
    }

    const cutoff = now.getTime() - MAX_PAPER_AGE_DAYS * DAY_MS;
    const articles = [...candidates.values()]
      .filter((paper) => paper.publishedAt.getTime() >= cutoff)
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, MAX_PAPERS_PER_DAY)
      .map((paper) => this.toArticle(paper));

    return { articles, invalidCount };
  }

  private toArticle(paper: PaperCandidate): CreateArticleInput {
    return {
      title: this.sanitizeText(paper.title),
      // 既存の記事と同じ arXiv の URL（重複は URL の完全一致で判定する）
      url: `https://arxiv.org/abs/${paper.arxivId}`,
      content: buildContent(paper),
      summary: undefined,
      publishedAt: paper.publishedAt,
      sourceId: this.source.id,
      // サムネイルは付けない。API の thumbnail は論文の1ページ目の画像で、論文ページの
      // arXiv の論文（画像なし）と混ざるとカードの高さが不ぞろいになるため（2026-10 に決定）
    };
  }
}

async function fetchPage(date: string, page: number): Promise<unknown[]> {
  const url = `${API_URL}?date=${date}&limit=${PAGE_LIMIT}&p=${page}`;
  // 同じ signal を fetch と json() の両方に効かせ、本文の読み取りが止まったときも打ち切る
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    // 読まない本文は捨てて接続を返す
    await response.body?.cancel();
    throw new Error(`Status code ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('応答が配列ではない');
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toCandidate(item: unknown): PaperCandidate | null {
  if (!isRecord(item) || !isRecord(item.paper)) return null;
  const { id, title, summary, publishedAt, upvotes, authors } = item.paper;
  if (typeof id !== 'string' || !ARXIV_ID_PATTERN.test(id)) return null;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof summary !== 'string' || summary.trim() === '') return null;
  if (typeof publishedAt !== 'string') return null;
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;

  return {
    arxivId: id,
    title,
    abstract: summary.trim(),
    publishedAt: published,
    upvotes: typeof upvotes === 'number' ? upvotes : 0,
    authors: Array.isArray(authors)
      ? authors
          .map((author) => (isRecord(author) ? author.name : undefined))
          .filter((name): name is string => typeof name === 'string')
      : [],
  };
}

/** 要約の生成に渡す本文。タイトル・著者・arXiv ID を要旨に添える */
function buildContent(paper: PaperCandidate): string {
  const lines = [`Title: ${paper.title}`, 'Source: Hugging Face Daily Papers'];
  if (paper.authors.length > 0) {
    const shown = paper.authors.slice(0, 10).join(', ');
    lines.push(
      `Authors: ${paper.authors.length > 10 ? `${shown}, et al.` : shown}`
    );
  }
  lines.push(`arXiv ID: ${paper.arxivId}`, '', 'Abstract:', paper.abstract);
  return lines.join('\n');
}

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
