/**
 * Topic Classifier
 *
 * 期間比較トピックの type（new / deprecated / trending）を件数から決定する。
 *
 * これらの判定は入力の count 2値だけで完全に決まるため、LLM に計算させない。
 * LLM に残すのは判断が要る部分（description の執筆、significance、
 * および「両期間に存在し焦点が変化したか」= updated の見極め）だけ。
 */

import { TAG_NORMALIZATION_MAP } from '@/lib/utils/tag/tag-normalizer';
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
 * 分析では併合しない TAG_NORMALIZATION_MAP の別名
 *
 * 表示用のマップには、別名と正式名で対象の範囲が変わる対応が混じっている。
 * 分析でこれらを併合すると、別の対象の件数が合算されて増減を取り違える。
 * 開発 DB のタグで確かめた例:
 * - spring → Spring Boot: "Spring" は Spring Framework 全般（季節の春の記事もある）
 * - rest → REST API: "REST" は設計様式そのもの（gRPC との比較、設計論）
 * - next → Next.js: "NeXT" は Jobs の NeXT 社の記事
 * - node → Node.js: "Node" / "NODE" は Kubernetes のノードや Neural ODE の記事
 * 他の対応は略称・綴り・訳語の違いで、同じ対象を指す。
 */
export const TOPIC_UNMERGED_ALIASES: ReadonlySet<string> = new Set([
  'spring',
  'rest',
  'next',
  'node',
]);

/**
 * 分析に使うトピックの正式名（表示名）
 *
 * 余分な空白を詰め、TAG_NORMALIZATION_MAP に同義語があれば正式名にする。
 * TOPIC_UNMERGED_ALIASES の別名とマップに無いトピックは、元の表記のまま返す
 * （normalizeTag は先頭を大文字にするため "iOS" が "IOS" になる）。
 * トレンド画面はこの名前でタグ検索のリンクを作るので、別名（"js" など）を残さない。
 */
export function canonicalTopicName(topic: string): string {
  const collapsed = topic.trim().replace(/\s+/g, ' ');
  const lower = collapsed.toLowerCase();
  if (TOPIC_UNMERGED_ALIASES.has(lower)) {
    return collapsed;
  }
  // hasOwn で引く（"constructor" などのプロトタイプのプロパティを拾わないため）
  return Object.hasOwn(TAG_NORMALIZATION_MAP, lower)
    ? TAG_NORMALIZATION_MAP[lower]
    : collapsed;
}

/**
 * トピックの記事を探すときに検索するタグ名（正式名と、併合した別名）
 *
 * 件数は別名のタグ（"ML" など）の記事も合算しているが、タグ検索は大文字小文字を
 * 無視した完全一致で同義語を展開しない。正式名だけでリンクすると別名だけが付いた
 * 記事が一覧から欠けるため、併合した別名も OR 検索に含める。
 */
export function topicSearchTags(topic: string): string[] {
  const canonical = canonicalTopicName(topic);
  const key = canonical.toLowerCase();
  const aliases = Object.keys(TAG_NORMALIZATION_MAP).filter(
    (alias) =>
      alias !== key &&
      !TOPIC_UNMERGED_ALIASES.has(alias) &&
      TAG_NORMALIZATION_MAP[alias].toLowerCase() === key
  );
  return [canonical, ...aliases];
}

/**
 * トピック名の正規化（照合キーの生成）
 *
 * 正式名（canonicalTopicName）を小文字にしたものをキーにする。
 * 大文字小文字・余分な空白と、TAG_NORMALIZATION_MAP の同義語を無視する。
 * これがないと "js" と "JavaScript" が別トピックになり、
 * 同一技術が deprecated と new に二重計上される。
 *
 * 注意: TAG_NORMALIZATION_MAP に無い表記ゆれ（例 "React.js" と "React"）は
 * 依然として別キーになる。解消するにはマップ側への追加が必要。
 */
export function normalizeTopic(topic: string): string {
  return canonicalTopicName(topic).toLowerCase();
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
      topic: canonicalTopicName(incoming.topic),
      articleIds: [...incoming.articleIds],
      headlines: [...incoming.headlines],
    };
  }

  return {
    // 表示名は正式名にする。マップに無い表記ゆれ（大文字小文字の違い）は、
    // 合算済みの側と新しく来た側のうち件数の多い方を採る（同数なら合算済みの側）。
    // 表記ごとの最多ではないが、本番の入力は期間集計（getTopicsForPeriod）で
    // キーごとに 1 件にまとまっており、ここで表記ゆれが衝突することはない
    topic: canonicalTopicName(
      incoming.count > existing.count ? incoming.topic : existing.topic
    ),
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
