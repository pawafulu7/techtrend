/**
 * Topic Classifier
 *
 * 期間比較トピックの type（new / deprecated / trending）を件数から決定する。
 *
 * これらの判定は入力の count 2値だけで完全に決まるため、LLM に計算させない。
 * LLM に残すのは判断が要る部分（description の執筆、significance、
 * および「両期間に存在し焦点が変化したか」= updated の見極め）だけ。
 */

import { normalizeTag } from '@/lib/utils/tag/tag-normalizer';
import type { TopicData } from './prompts/diff-summary-prompt';

/** 報告対象とする最低件数 */
export const MIN_TOPIC_COUNT = 3;
/** trending 判定に必要な増加率（1.5 = 50%増） */
export const TRENDING_GROWTH_RATIO = 1.5;
/** trending 判定に必要な増加件数 */
export const TRENDING_MIN_DELTA = 3;
/** deprecated 判定に必要な減少後の比率（0.5 = 半減以下） */
export const DEPRECATED_DECLINE_RATIO = 0.5;

/**
 * 汎用的すぎて検索価値のないトピック
 *
 * 単独で現れた場合のみ除外する（"web開発" のような複合語は除外しない）。
 * diff-summary-service.ts が LLM 出力後に適用していたリストと同一集合であること。
 * 二重管理すると「分類器は通すが後段が落とす」トピックが生まれ、
 * summary / keyTakeaways だけが削除済みトピックに言及し続ける。
 */
export const GENERIC_TOPICS = new Set([
  'ai',
  'llm',
  'ml',
  'deep learning',
  '機械学習',
  'プログラミング',
  '開発',
  'エンジニアリング',
  '技術',
  'web',
  'api',
  'データ',
  'クラウド',
  'ソフトウェア',
  'software',
  'programming',
  'development',
  'technology',
  'data',
  'cloud',
]);

/** 件数から機械的に決まる type */
export type ComputedChangeType = 'new' | 'deprecated' | 'trending';

export interface ClassifiedTopic {
  topic: string;
  type: ComputedChangeType;
  baselineCount: number;
  currentCount: number;
  /**
   * 両期間の見出しを渡す。
   * 現在期間だけにすると trending / 半減 deprecated で比較根拠が欠け、
   * 「外部知識は使わない」制約下で変化の説明を書けず幻覚を招く。
   */
  baselineHeadlines: string[];
  currentHeadlines: string[];
  articleIds: string[];
}

/** 両期間に3件以上あり、updated か unchanged かの判断を LLM に委ねるもの */
export interface UpdateCandidate {
  topic: string;
  baselineCount: number;
  currentCount: number;
  baselineHeadlines: string[];
  currentHeadlines: string[];
  articleIds: string[];
}

export interface ClassificationResult {
  classified: ClassifiedTopic[];
  updateCandidates: UpdateCandidate[];
  /** 両期間に存在するが変化が閾値未満のもの */
  unchanged: string[];
  /** 汎用トピックとして除外したもの（観測用） */
  excluded: string[];
}

/**
 * トピック名の正規化（照合キーの生成）
 *
 * 大文字小文字と余分な空白を無視したうえで、プロジェクト共通の
 * TAG_NORMALIZATION_MAP による同義語マージを適用する。
 * これがないと "js" と "JavaScript" が別トピックになり、
 * 同一技術が deprecated と new に二重計上される。
 *
 * 注意: TAG_NORMALIZATION_MAP に無い表記ゆれ（例 "React.js" と "React"）は
 * 依然として別キーになる。解消するにはマップ側への追加が必要。
 */
export function normalizeTopic(topic: string): string {
  const collapsed = topic.trim().replace(/\s+/g, ' ');
  if (!collapsed) {
    return '';
  }
  return normalizeTag(collapsed).toLowerCase();
}

/**
 * 同一期間内で正規化キーが衝突したトピックを合算する
 *
 * normalizeTopic は同義語をマージするため、同じ期間に "js" と "JavaScript" が
 * 並ぶと同一キーになる。Map への単純代入だと後勝ちで片方の count / articleIds /
 * headlines が消え、閾値判定・trending・deprecated が誤る。
 */
export function mergeTopicData(
  existing: TopicData | undefined,
  incoming: TopicData
): TopicData {
  if (!existing) {
    return {
      ...incoming,
      articleIds: [...incoming.articleIds],
      headlines: [...incoming.headlines],
    };
  }

  return {
    // 表示名は件数の多い側を採用する（同数なら先勝ち）
    topic: incoming.count > existing.count ? incoming.topic : existing.topic,
    count: existing.count + incoming.count,
    articleIds: [...new Set([...existing.articleIds, ...incoming.articleIds])],
    headlines: [...new Set([...existing.headlines, ...incoming.headlines])],
  };
}

/** 正規化キーごとに合算した Map を作る */
function groupByNormalizedTopic(topics: TopicData[]): Map<string, TopicData> {
  const map = new Map<string, TopicData>();
  for (const t of topics) {
    const key = normalizeTopic(t.topic);
    map.set(key, mergeTopicData(map.get(key), t));
  }
  return map;
}

/** 各期間から比較対象に載せる上限件数 */
export const TOPIC_TOP_N = 30;

/**
 * 両期間のトピックを突き合わせて、比較に渡す集合を決める
 *
 * 各期間を独立に上位N件で打ち切ると、順位がN+1位へ落ちただけのトピックが
 * 「0件」に見えて deprecated に、逆にN+1位からN位へ入っただけが new になる。
 * どちらかの期間で上位N件に入ったトピックを和集合として残し、
 * 相手側の期間にも上位N件の外にある実データを添えて返す。
 *
 * @param currentAll 現在期間の全トピック（件数降順）
 * @param baselineAll 基準期間の全トピック（件数降順）
 */
export function reconcileTopics(
  currentAll: TopicData[],
  baselineAll: TopicData[],
  topN: number = TOPIC_TOP_N
): { current: TopicData[]; baseline: TopicData[] } {
  // 同一期間内の同義語は合算する（後勝ちで捨てない）
  const currentByKey = groupByNormalizedTopic(currentAll);
  const baselineByKey = groupByNormalizedTopic(baselineAll);

  // 上位N件の判定も合算後の件数で行う（合算前の順位では取りこぼす）
  const topKeys = (byKey: Map<string, TopicData>) =>
    [...byKey.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, topN)
      .map(([key]) => key);

  const keys = new Set<string>([
    ...topKeys(currentByKey),
    ...topKeys(baselineByKey),
  ]);

  const current: TopicData[] = [];
  const baseline: TopicData[] = [];
  for (const key of keys) {
    // 実際に0件の期間だけを「存在しない」として扱う
    const c = currentByKey.get(key);
    const b = baselineByKey.get(key);
    if (c) current.push(c);
    if (b) baseline.push(b);
  }

  return { current, baseline };
}


interface Merged {
  display: string;
  baseline?: TopicData;
  current?: TopicData;
}

/**
 * 期間比較トピックを分類する
 *
 * 判定順は「消滅 → 半減 → 急増 → 更新候補」。
 * 減少しているトピックが trending になることは構造上ありえない。
 */
export function classifyTopics(
  currentTopics: TopicData[],
  baselineTopics: TopicData[]
): ClassificationResult {
  // 同一期間内で正規化キーが衝突するトピックは合算してから突き合わせる
  const baselineByKey = groupByNormalizedTopic(baselineTopics);
  const currentByKey = groupByNormalizedTopic(currentTopics);

  const merged = new Map<string, Merged>();
  for (const [key, t] of baselineByKey) {
    merged.set(key, { display: t.topic, baseline: t });
  }
  for (const [key, t] of currentByKey) {
    const entry = merged.get(key);
    if (entry) {
      entry.current = t;
      entry.display = t.topic; // 表示名は現在期間を優先
    } else {
      merged.set(key, { display: t.topic, current: t });
    }
  }

  const classified: ClassifiedTopic[] = [];
  const updateCandidates: UpdateCandidate[] = [];
  const unchanged: string[] = [];
  const excluded: string[] = [];

  for (const [key, entry] of merged) {
    if (GENERIC_TOPICS.has(key)) {
      excluded.push(entry.display);
      continue;
    }

    const baselineCount = entry.baseline?.count ?? 0;
    const currentCount = entry.current?.count ?? 0;
    const baselineHeadlines = entry.baseline?.headlines ?? [];
    const currentHeadlines = entry.current?.headlines ?? [];
    const articleIds =
      entry.current?.articleIds ?? entry.baseline?.articleIds ?? [];

    // 新規: 基準期間に存在せず、現在期間で閾値以上
    if (baselineCount === 0) {
      if (currentCount >= MIN_TOPIC_COUNT) {
        classified.push({
          topic: entry.display,
          type: 'new',
          baselineCount,
          currentCount,
          baselineHeadlines,
          currentHeadlines,
          articleIds,
        });
      }
      continue;
    }

    // 消滅・半減: 基準期間に閾値以上あったものが消えた/半減した
    if (
      baselineCount >= MIN_TOPIC_COUNT &&
      currentCount <= baselineCount * DEPRECATED_DECLINE_RATIO
    ) {
      classified.push({
        topic: entry.display,
        type: 'deprecated',
        baselineCount,
        currentCount,
        baselineHeadlines,
        currentHeadlines,
        articleIds,
      });
      continue;
    }

    // 急増: 50%以上増加 かつ +3件以上（減少側はここに到達しない）
    if (
      currentCount >= baselineCount * TRENDING_GROWTH_RATIO &&
      currentCount - baselineCount >= TRENDING_MIN_DELTA
    ) {
      classified.push({
        topic: entry.display,
        type: 'trending',
        baselineCount,
        currentCount,
        baselineHeadlines,
        currentHeadlines,
        articleIds,
      });
      continue;
    }

    // 両期間で閾値以上なら updated か unchanged かを LLM が見出しで判断する
    if (baselineCount >= MIN_TOPIC_COUNT && currentCount >= MIN_TOPIC_COUNT) {
      updateCandidates.push({
        topic: entry.display,
        baselineCount,
        currentCount,
        baselineHeadlines: entry.baseline?.headlines ?? [],
        currentHeadlines: entry.current?.headlines ?? [],
        articleIds,
      });
      continue;
    }

    unchanged.push(entry.display);
  }

  return { classified, updateCandidates, unchanged, excluded };
}
