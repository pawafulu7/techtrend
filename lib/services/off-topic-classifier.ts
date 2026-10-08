/**
 * 技術者向けでない記事（一般の経済・政治・事件など）を判定する（issue #722）
 *
 * 総合ニュース寄りのソース（Hacker News・Techmeme・Business Insider）は技術以外の話題も流す。
 * タグ・カテゴリでは区別できない（AI 業界の政治・金融の記事にも AI のタグが付き ai_ml になる）ため、
 * タイトルと一覧要約を LLM に渡して判定し、Article.isOffTopic を立てる。消さずにフラグにして、
 * 一覧の既定の表示から外す（includeOffTopic=true で表示できる）。
 *
 * LLM には記事の主題のラベルだけを選ばせ、外すかどうかはコード（TOPIC_POLICY）で決める。
 * 「技術記事か」を true/false で直接答えさせると、主題の理解と掲載方針の当てはめが混ざり、
 * 理由にキャリアや OSS の運営と書きながら外す、といった誤りが多かった（開発 DB の1週間で
 * 外した約380件のうち数十件）。誤って技術記事を外す方が害が大きいので、主題を決められない
 * 記事（unclear）と未知のラベルは残す。
 */
import { z } from 'zod';
import type { PrismaClient } from '@/lib/prisma-exports';
import {
  parseJSONFromLLM,
  type ExtractionConfig,
  type ExtractionOptions,
  type ExtractionResult,
} from '@/lib/ai/extraction';

/** 判定する期間（日）。これより古い記事は判定しない（遡るときは days を渡す） */
export const OFF_TOPIC_WINDOW_DAYS = 7;
/** 1回の LLM 呼び出しで判定する記事数 */
export const OFF_TOPIC_BATCH_SIZE = 25;
/** 1回の実行で判定する記事数の上限 */
export const OFF_TOPIC_DEFAULT_LIMIT = 500;
/** 判定に渡す一覧要約の最大文字数 */
const SUMMARY_MAX_CHARS = 300;

export const OFF_TOPIC_PROMPT_VERSION = '2.0';

/** 主題のラベルと、そのラベルの記事を外すか（true = 技術者向けでない） */
export const TOPIC_POLICY = {
  software: false,
  ai: false,
  product: false,
  security: false,
  engineering_org: false,
  tech_community: false,
  unclear: false,
  finance: true,
  business_people: true,
  politics_law: true,
  market_research: true,
  science_health: true,
  lifestyle_culture: true,
  general_news: true,
} as const satisfies Record<string, boolean>;

export type OffTopicLabel = keyof typeof TOPIC_POLICY;

/** ラベルから外すかどうかを決める。未知のラベルは残す（誤って外さないため） */
export function isOffTopicLabel(topic: string): boolean {
  return Object.hasOwn(TOPIC_POLICY, topic)
    ? TOPIC_POLICY[topic as OffTopicLabel]
    : false;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OffTopicInput {
  id: string;
  title: string;
  translatedTitle: string | null;
  summary: string | null;
  sourceName: string;
}

export interface OffTopicVerdict {
  /** 入力の何番目か（1 始まり） */
  i: number;
  /** 主題のラベル（TOPIC_POLICY のキー。未知の値もそのまま持つ） */
  topic: string;
  /** ラベルを選んだ根拠（記事の主題を短く書いたもの） */
  evidence: string;
}

const VerdictListSchema = z.array(
  z.object({
    i: z.number().int().positive(),
    topic: z.string(),
    // 判定には使わない（確認用）ので、抜けていても失敗にしない
    evidence: z.string().default(''),
  })
);

/** LLM 呼び出しの差し替え口（本番は LLMExtractionPipeline） */
export interface OffTopicExtractor {
  extract<T>(
    input: unknown,
    config: ExtractionConfig<T>,
    options?: ExtractionOptions
  ): Promise<ExtractionResult<T>>;
}

export function buildOffTopicPrompt(items: OffTopicInput[]): string {
  const list = items
    .map((item, index) => {
      const lines = [`[${index + 1}] ソース: ${item.sourceName}`];
      if (item.translatedTitle && item.translatedTitle !== item.title) {
        lines.push(`タイトル: ${item.translatedTitle}（原題: ${item.title}）`);
      } else {
        lines.push(`タイトル: ${item.title}`);
      }
      if (item.summary) {
        lines.push(`要約: ${item.summary.slice(0, SUMMARY_MAX_CHARS)}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  return `あなたはソフトウェアエンジニア向けの技術ニュースサイトの編集者です。
次の記事それぞれについて、記事の主題（いちばん伝えたいこと）を表すラベルを1つ選んでください。
記事に出てくる単語ではなく主題で選びます。技術的な詳しさは問いません。

【ラベル】
software: プログラミング、開発技術・手法、開発ツール、インフラ、クラウド、データベース、OS、ブラウザ、ハードウェアの技術
ai: AI・機械学習の技術、モデル、研究、使い方
product: 製品・サービス・デバイスの発表、機能追加、仕様・料金・利用条件の変更、提供終了、障害
security: 脆弱性、攻撃、不正アクセス、情報漏えい、プライバシーの問題
engineering_org: 開発組織、チームづくり、エンジニアの採用・キャリア・学習・働き方、開発現場での AI の使われ方
tech_community: 技術カンファレンス・勉強会への登壇や参加、技術コミュニティ、OSS の運営・資金、技術メディア
finance: 資金調達、決算、IPO、株価、投資、買収の金額や条件、富豪の資産
business_people: 経営者・役員の人事、経営者や著名人の発言・予測・講演、企業の経営戦略や広報
politics_law: 政治、選挙、外交、政府の方針、規制をめぐる議論、訴訟・判決
market_research: 市場調査、世論調査、業界の経済規模や普及率の予測（開発者や開発現場を対象にした調査は engineering_org）
science_health: 技術以外の科学、医療、健康、食事
lifestyle_culture: 生活、旅行、不動産、住まい、育児、歴史、文化、芸術、ゲームや本の紹介、仕事と関係のない個人的なエッセイ
general_news: 技術と関係のない事件・事故、社会問題、教育問題
unclear: 主題を1つに決められない、または情報が足りない

【選び方の例】
- OSS プロジェクトが維持費を集める仕組みを始めた → tech_community（AI スタートアップが資金を集めた → finance）
- 開発チームでの AI の利用状況を調べた → engineering_org（AI 市場が何兆円になるかの予測 → market_research）
- サービスの料金プランや利用上限が変わった → product（その会社の株価が上がった → finance）
- 社員がカンファレンスで登壇する・協賛する → tech_community（CEO が講演で AI の未来を語った → business_people）
- ゲームやパズルを題材にアルゴリズムやデータ構造を説明する → software
- 会員サイトへの不正アクセスで個人情報が漏れた → security
- エンジニアの 1on1、学び方、転職、評価 → engineering_org
- クラウドや AI の利用料・コストを下げた工夫 → software（企業の売上や利益 → finance）
- 開発者向けの規約・ポリシー・ライセンスの変更 → product（政府の規制や法案 → politics_law）
- 経営者や著名な開発者でも、開発の進め方・言語・エンジニアの仕事について語っていれば → software か engineering_org
- プログラミング言語や技術の人気の推移を分析した → software

【出力】
JSON の配列だけを出力してください。説明文やコードブロックは不要です。
各要素は {"i": 記事の番号, "topic": "ラベル", "evidence": "記事の主題（30文字以内）"} です。
evidence の中では二重引用符（"）を使わず、引用は「」で書いてください。
すべての記事（1〜${items.length}）を1回ずつ含めてください。

【記事】
${list}`;
}

/**
 * LLM の応答を判定の一覧にする。番号の欠け・重複・範囲外があれば例外を投げる
 * （パイプラインが再試行する）。
 */
export function parseOffTopicVerdicts(
  text: string,
  count: number
): OffTopicVerdict[] {
  // 配列の末尾のカンマ（`},\n]`）と、evidence の中のエスケープされていない二重引用符が
  // 付くことがある。そのまま渡すと parseJSONFromLLM が最初のオブジェクトだけを取り出して
  // しまうので、先に直す（evidence は 1 要素 1 行で、行末の `"}` までを値とみなす）
  const cleaned = text
    .replace(/,(\s*[\]}])/g, '$1')
    .replace(
      /("evidence"\s*:\s*")(.*)("\s*\}\s*,?\s*)$/gm,
      (_, open: string, value: string, close: string) =>
        open + value.replace(/(?<!\\)"/g, '\\"') + close
    );
  const verdicts = VerdictListSchema.parse(parseJSONFromLLM<unknown>(cleaned));
  const seen = new Set<number>();
  for (const v of verdicts) {
    if (v.i > count) {
      throw new Error(`Verdict index out of range: ${v.i} > ${count}`);
    }
    if (seen.has(v.i)) {
      throw new Error(`Duplicate verdict index: ${v.i}`);
    }
    seen.add(v.i);
  }
  if (seen.size !== count) {
    throw new Error(`Expected ${count} verdicts, got ${seen.size}`);
  }
  return verdicts.sort((a, b) => a.i - b.i);
}

export interface ClassifyOffTopicOptions {
  /** 書き込まずに判定だけする */
  dryRun?: boolean;
  /** 期間の終わり（既定は現在） */
  now?: Date;
  /** 判定する期間（日） */
  days?: number;
  /** 1回で判定する記事数の上限 */
  limit?: number;
  /** 判定済みの記事も判定し直す */
  recheck?: boolean;
}

export interface ClassifiedArticle extends OffTopicInput {
  isOffTopic: boolean;
  topic: string;
  evidence: string;
}

export interface ClassifyOffTopicResult {
  candidates: number;
  classified: number;
  offTopic: number;
  /** isOffTopic の値が変わった記事数（一覧のキャッシュを捨てるかの判断に使う） */
  changed: number;
  failedBatches: number;
  articles: ClassifiedArticle[];
}

export async function classifyOffTopicArticles(
  prisma: PrismaClient,
  extractor: OffTopicExtractor,
  options: ClassifyOffTopicOptions = {}
): Promise<ClassifyOffTopicResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? OFF_TOPIC_WINDOW_DAYS;
  const limit = options.limit ?? OFF_TOPIC_DEFAULT_LIMIT;

  const rows = await prisma.article.findMany({
    where: {
      isHidden: false,
      summary: { not: null },
      publishedAt: { gte: new Date(now.getTime() - days * DAY_MS), lt: now },
      ...(options.recheck ? {} : { offTopicCheckedAt: null }),
    },
    select: {
      id: true,
      title: true,
      translatedTitle: true,
      summary: true,
      isOffTopic: true,
      source: { select: { name: true } },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  const result: ClassifyOffTopicResult = {
    candidates: rows.length,
    classified: 0,
    offTopic: 0,
    changed: 0,
    failedBatches: 0,
    articles: [],
  };

  for (let start = 0; start < rows.length; start += OFF_TOPIC_BATCH_SIZE) {
    const batch = rows.slice(start, start + OFF_TOPIC_BATCH_SIZE);
    const inputs: OffTopicInput[] = batch.map((row) => ({
      id: row.id,
      title: row.title,
      translatedTitle: row.translatedTitle,
      summary: row.summary,
      sourceName: row.source.name,
    }));

    const extraction = await extractor.extract<OffTopicVerdict[]>(
      inputs,
      {
        schema: VerdictListSchema,
        promptVersion: OFF_TOPIC_PROMPT_VERSION,
        buildPrompt: () => buildOffTopicPrompt(inputs),
        parseResponse: (text) => parseOffTopicVerdicts(text, inputs.length),
      },
      { temperature: 0, maxOutputTokens: 4000 }
    );

    // 判定できなかった記事は未判定のまま残し、次の実行で判定し直す（既定の表示には残る）
    if (!extraction.success || !extraction.data) {
      result.failedBatches++;
      continue;
    }

    const offTopicIds: string[] = [];
    const techIds: string[] = [];
    for (const verdict of extraction.data) {
      const row = batch[verdict.i - 1];
      const isOffTopic = isOffTopicLabel(verdict.topic);
      (isOffTopic ? offTopicIds : techIds).push(row.id);
      if (row.isOffTopic !== isOffTopic) result.changed++;
      result.articles.push({
        ...inputs[verdict.i - 1],
        isOffTopic,
        topic: verdict.topic,
        evidence: verdict.evidence,
      });
    }
    result.classified += batch.length;
    result.offTopic += offTopicIds.length;

    if (!options.dryRun) {
      const checkedAt = new Date();
      await prisma.$transaction([
        prisma.article.updateMany({
          where: { id: { in: offTopicIds } },
          data: { isOffTopic: true, offTopicCheckedAt: checkedAt },
        }),
        prisma.article.updateMany({
          where: { id: { in: techIds } },
          data: { isOffTopic: false, offTopicCheckedAt: checkedAt },
        }),
      ]);
    }
  }

  return result;
}
