import {
  canonicalTopicName,
  classifyTopics,
  normalizeTopic,
  reconcileTopics,
  GENERIC_TOPICS,
  TOPIC_UNMERGED_ALIASES,
  topicSearchTags,
} from '@/lib/ai/extraction/topic-classifier';
import { topicSearchHref } from '@/app/trends/diff/_components/diff-utils';
import { TAG_NORMALIZATION_MAP } from '@/lib/utils/tag/tag-normalizer';
import type { TopicData } from '@/lib/ai/extraction/prompts/diff-summary-prompt';

/** テスト用トピック生成ヘルパー */
function topic(name: string, count: number): TopicData {
  return {
    topic: name,
    count,
    articleIds: Array.from({ length: count }, (_, i) => `${name}_${i}`),
    headlines: Array.from({ length: count }, (_, i) => `${name} headline ${i}`),
  };
}

/** classified から type を引く */
function typeOf(
  result: ReturnType<typeof classifyTopics>,
  name: string
): string | undefined {
  return result.classified.find((c) => c.topic === name)?.type;
}

describe('classifyTopics', () => {
  describe('new（新規）', () => {
    it('基準期間0件・現在期間3件以上なら new', () => {
      const result = classifyTopics([topic('RAG', 5)], []);
      expect(typeOf(result, 'RAG')).toBe('new');
    });

    it('基準期間0件でも現在期間が閾値未満なら報告対象外', () => {
      const result = classifyTopics([topic('RAG', 2)], []);
      expect(result.classified).toHaveLength(0);
      expect(result.updateCandidates).toHaveLength(0);
    });

    it('境界値: 現在期間ちょうど3件は new', () => {
      const result = classifyTopics([topic('LoRA', 3)], []);
      expect(typeOf(result, 'LoRA')).toBe('new');
    });
  });

  describe('deprecated（減少）', () => {
    it('基準期間10件が0件になれば deprecated', () => {
      const result = classifyTopics([], [topic('jQuery', 10)]);
      expect(typeOf(result, 'jQuery')).toBe('deprecated');
    });

    it('基準期間10件が4件（60%減）なら deprecated', () => {
      const result = classifyTopics(
        [topic('jQuery', 4)],
        [topic('jQuery', 10)]
      );
      expect(typeOf(result, 'jQuery')).toBe('deprecated');
    });

    it('基準期間2件が0件になっても閾値未満なので報告対象外', () => {
      const result = classifyTopics([], [topic('Backbone', 2)]);
      expect(result.classified).toHaveLength(0);
    });

    it('境界値: ちょうど半減は deprecated', () => {
      const result = classifyTopics([topic('Vue', 5)], [topic('Vue', 10)]);
      // 表示名は正式名（vue → Vue.js）
      expect(typeOf(result, 'Vue.js')).toBe('deprecated');
    });
  });

  describe('trending（急上昇）', () => {
    it('4件→8件（100%増・+4件）は trending', () => {
      const result = classifyTopics([topic('Rust', 8)], [topic('Rust', 4)]);
      expect(typeOf(result, 'Rust')).toBe('trending');
    });

    it('2件→5件（+3件）は trending', () => {
      const result = classifyTopics([topic('Zig', 5)], [topic('Zig', 2)]);
      expect(typeOf(result, 'Zig')).toBe('trending');
    });

    it('2件→3件（+1件）は増加量が閾値未満なので対象外', () => {
      const result = classifyTopics([topic('Nim', 3)], [topic('Nim', 2)]);
      expect(result.classified).toHaveLength(0);
    });

    it('増加率が50%未満なら +3件以上でも trending にしない', () => {
      // 10 -> 14: +4件だが増加率40%
      const result = classifyTopics([topic('Go', 14)], [topic('Go', 10)]);
      expect(typeOf(result, 'Go')).toBeUndefined();
    });
  });

  describe('減少トピックの誤分類防止（旧プロンプトの強調パッチ相当）', () => {
    it.each([
      [10, 4],
      [8, 2],
      [20, 1],
      [5, 0],
    ])('基準%i件→現在%i件は決して trending にならない', (before, after) => {
      const current = after > 0 ? [topic('X', after)] : [];
      const result = classifyTopics(current, [topic('X', before)]);
      expect(typeOf(result, 'X')).not.toBe('trending');
    });
  });

  describe('汎用トピックの除外', () => {
    it('単独の汎用トピックは除外される', () => {
      const result = classifyTopics(
        [topic('ai', 50), topic('llm', 40), topic('Claude Code', 8)],
        []
      );
      expect(result.classified.map((c) => c.topic)).toEqual(['Claude Code']);
      // 表示名は正式名（ai → AI）
      expect(result.excluded).toEqual(expect.arrayContaining(['AI', 'llm']));
    });

    it('複合語は除外しない', () => {
      const result = classifyTopics([topic('web開発', 10)], []);
      expect(typeOf(result, 'web開発')).toBe('new');
    });

    it('大文字表記の汎用トピックも除外される', () => {
      const result = classifyTopics([topic('AI', 30)], []);
      expect(result.classified).toHaveLength(0);
      expect(result.excluded).toContain('AI');
    });
  });

  describe('トピック名の正規化', () => {
    it('大文字小文字・余分な空白を無視して同一トピックとして扱う', () => {
      const result = classifyTopics(
        [topic('React  Server   Components', 9)],
        [topic('react server components', 3)]
      );
      expect(result.classified).toHaveLength(1);
      // 表示名は余分な空白を詰めた表記
      expect(typeOf(result, 'React Server Components')).toBe('trending');
    });

    it('表示名は現在期間のものを優先する', () => {
      const result = classifyTopics(
        [topic('TypeScript', 9)],
        [topic('typescript', 3)]
      );
      expect(result.classified[0].topic).toBe('TypeScript');
    });

    it('normalizeTopic は小文字化と空白圧縮を行う', () => {
      expect(normalizeTopic('  React   Native ')).toBe('react native');
    });
  });

  describe('更新候補（LLMに判断を委ねる部分）', () => {
    it('両期間に閾値以上あり変化が小さいものは updateCandidates に入る', () => {
      const result = classifyTopics([topic('Python', 6)], [topic('Python', 5)]);
      expect(result.classified).toHaveLength(0);
      expect(result.updateCandidates.map((c) => c.topic)).toEqual(['Python']);
    });

    it('更新候補には両期間の見出しが含まれる', () => {
      const result = classifyTopics([topic('Python', 6)], [topic('Python', 5)]);
      const candidate = result.updateCandidates[0];
      expect(candidate.currentHeadlines).toHaveLength(6);
      expect(candidate.baselineHeadlines).toHaveLength(5);
      expect(candidate.baselineCount).toBe(5);
      expect(candidate.currentCount).toBe(6);
    });

    it('片方が閾値未満なら updateCandidates に入れず unchanged にする', () => {
      const result = classifyTopics([topic('Perl', 2)], [topic('Perl', 2)]);
      expect(result.updateCandidates).toHaveLength(0);
      expect(result.unchanged).toContain('Perl');
    });
  });

  describe('全体', () => {
    it('分類結果が互いに重複しない', () => {
      const result = classifyTopics(
        [topic('A', 8), topic('B', 6), topic('C', 2), topic('ai', 30)],
        [topic('A', 2), topic('B', 5), topic('C', 2), topic('D', 10)]
      );
      const names = [
        ...result.classified.map((c) => c.topic),
        ...result.updateCandidates.map((c) => c.topic),
        ...result.unchanged,
        ...result.excluded,
      ];
      expect(new Set(names).size).toBe(names.length);
    });

    it('空入力でも例外を投げない', () => {
      const result = classifyTopics([], []);
      expect(result).toEqual({
        classified: [],
        updateCandidates: [],
        unchanged: [],
        excluded: [],
      });
    });

    it('GENERIC_TOPICS の各項目は正規化後も除外対象のままである', () => {
      // normalizeTopic は TAG_NORMALIZATION_MAP を通すため、
      // 一部の項目は別表記へ寄る（例: ml -> 機械学習）。
      // 重要なのは「正規化後のキーも除外集合に含まれる」こと。
      for (const t of GENERIC_TOPICS) {
        expect(GENERIC_TOPICS.has(normalizeTopic(t))).toBe(true);
      }
    });
  });

  describe('同義語マージ（TAG_NORMALIZATION_MAP の再利用）', () => {
    it('js と JavaScript は同一トピックとして統合される', () => {
      const result = classifyTopics([topic('JavaScript', 9)], [topic('js', 3)]);
      expect(result.classified).toHaveLength(1);
      expect(typeOf(result, 'JavaScript')).toBe('trending');
    });

    it('表記ゆれが deprecated と new に二重計上されない', () => {
      const result = classifyTopics([topic('Vue.js', 5)], [topic('vuejs', 5)]);
      expect(result.classified).toHaveLength(0);
      expect(result.updateCandidates.map((c) => c.topic)).toEqual(['Vue.js']);
    });
  });

  describe('両期間の見出しを渡す', () => {
    it('trending でも基準期間の見出しが失われない', () => {
      const result = classifyTopics([topic('Rust', 8)], [topic('Rust', 4)]);
      const t = result.classified[0];
      expect(t.type).toBe('trending');
      expect(t.baselineHeadlines).toHaveLength(4);
      expect(t.currentHeadlines).toHaveLength(8);
    });

    it('消滅した deprecated では現在期間の見出しが空になる', () => {
      const result = classifyTopics([], [topic('jQuery', 10)]);
      const t = result.classified[0];
      expect(t.type).toBe('deprecated');
      expect(t.baselineHeadlines).toHaveLength(10);
      expect(t.currentHeadlines).toEqual([]);
    });
  });
});

describe('reconcileTopics', () => {
  it('片方の期間で上位N件から漏れただけのトピックを0件扱いしない', () => {
    // 現在期間: X は3位。基準期間: X は topN の外（4位）だが実データは存在する
    const current = [topic('A', 10), topic('B', 9), topic('X', 8)];
    const baseline = [
      topic('A', 10),
      topic('B', 9),
      topic('C', 8),
      topic('X', 7),
    ];

    const { baseline: reconciled } = reconcileTopics(current, baseline, 3);
    const x = reconciled.find((t) => t.topic === 'X');
    expect(x).toBeDefined();
    expect(x?.count).toBe(7);
  });

  it('打ち切りを補正すると誤った new / deprecated が発生しない', () => {
    const current = [topic('A', 10), topic('B', 9), topic('X', 8)];
    const baseline = [
      topic('A', 10),
      topic('B', 9),
      topic('C', 8),
      topic('X', 7),
    ];

    const naive = classifyTopics(current, baseline.slice(0, 3));
    expect(naive.classified.find((c) => c.topic === 'X')?.type).toBe('new');

    const { current: c2, baseline: b2 } = reconcileTopics(current, baseline, 3);
    const fixed = classifyTopics(c2, b2);
    expect(fixed.classified.find((c) => c.topic === 'X')).toBeUndefined();
  });

  it('実際に0件の期間は「存在しない」まま扱う', () => {
    const current = [topic('NEW', 5)];
    const baseline = [topic('OLD', 5)];

    const { current: c, baseline: b } = reconcileTopics(current, baseline, 30);
    expect(c.map((t) => t.topic)).toEqual(['NEW']);
    expect(b.map((t) => t.topic)).toEqual(['OLD']);

    const result = classifyTopics(c, b);
    expect(result.classified.find((x) => x.topic === 'NEW')?.type).toBe('new');
    expect(result.classified.find((x) => x.topic === 'OLD')?.type).toBe(
      'deprecated'
    );
  });
});

describe('同一期間内の同義語集約（後勝ちで捨てない）', () => {
  it('同じ期間の js と JavaScript は件数が合算される', () => {
    // 合算しないと片方(3件)だけが残り、閾値・trending 判定が狂う
    const result = classifyTopics(
      [topic('js', 3), topic('JavaScript', 5)],
      []
    );
    expect(result.classified).toHaveLength(1);
    expect(result.classified[0].currentCount).toBe(8);
    expect(result.classified[0].type).toBe('new');
  });

  it('合算により閾値未満だったトピックが報告対象になる', () => {
    // js=2, JavaScript=2 は単独では MIN_TOPIC_COUNT(3) 未満だが合算すると4件
    const result = classifyTopics(
      [topic('js', 2), topic('JavaScript', 2)],
      []
    );
    expect(result.classified).toHaveLength(1);
    expect(result.classified[0].currentCount).toBe(4);
  });

  it('合算時に記事IDと見出しが結合される', () => {
    const result = classifyTopics(
      [topic('js', 3), topic('JavaScript', 5)],
      []
    );
    const t = result.classified[0];
    expect(t.currentHeadlines).toHaveLength(8);
    expect(t.articleIds).toHaveLength(8);
  });

  it('reconcileTopics でも同一期間の同義語が合算される', () => {
    const { current } = reconcileTopics(
      [topic('js', 3), topic('JavaScript', 5)],
      [],
      30
    );
    expect(current).toHaveLength(1);
    expect(current[0].count).toBe(8);
  });

  it('合算後の表示名は件数の多い側を採用する', () => {
    const result = classifyTopics(
      [topic('js', 2), topic('JavaScript', 9)],
      []
    );
    expect(result.classified[0].topic).toBe('JavaScript');
  });
});

describe('表示名は正式名にする（issue #655 項目 5）', () => {
  it('canonicalTopicName は同義語を正式名にし、マップに無い表記はそのまま返す', () => {
    expect(canonicalTopicName('js')).toBe('JavaScript');
    expect(canonicalTopicName('  vuejs ')).toBe('Vue.js');
    // normalizeTag と違い先頭を大文字にしない
    expect(canonicalTopicName('iOS')).toBe('iOS');
    expect(canonicalTopicName('  React   Native ')).toBe('React Native');
  });

  it('プロトタイプのプロパティ名で例外にならない', () => {
    expect(canonicalTopicName('constructor')).toBe('constructor');
    expect(normalizeTopic('toString')).toBe('tostring');
  });

  it('同じ期間の js（多い）と JavaScript を合算すると表示名は JavaScript', () => {
    const result = classifyTopics(
      [topic('js', 9), topic('JavaScript', 2)],
      []
    );
    expect(result.classified).toHaveLength(1);
    expect(result.classified[0].topic).toBe('JavaScript');
    expect(result.classified[0].currentCount).toBe(11);
  });

  it('後から来た別名の方が多くても表示名は JavaScript', () => {
    const result = classifyTopics(
      [topic('JavaScript', 2), topic('js', 9)],
      []
    );
    expect(result.classified[0].topic).toBe('JavaScript');
  });

  it('別名だけのトピックも表示名は正式名', () => {
    const result = classifyTopics([topic('js', 5)], []);
    expect(result.classified[0].topic).toBe('JavaScript');

    const { current } = reconcileTopics([topic('js', 9), topic('JavaScript', 2)], [], 30);
    expect(current.map((t) => t.topic)).toEqual(['JavaScript']);
  });

  it('期間をまたいでも表示名は正式名（基準期間 JavaScript・現在期間 js）', () => {
    const result = classifyTopics([topic('js', 9)], [topic('JavaScript', 3)]);
    expect(result.classified).toHaveLength(1);
    expect(result.classified[0].topic).toBe('JavaScript');
  });

  it('マップに無い大文字小文字の違いは件数の多い表記を採る', () => {
    const result = classifyTopics(
      [topic('claude code', 2), topic('Claude Code', 5)],
      []
    );
    expect(result.classified[0].topic).toBe('Claude Code');
  });
});

describe('範囲が変わる別名は併合しない（issue #655 項目 5）', () => {
  it('同じ期間の Spring と Spring Boot は別トピック（classifyTopics）', () => {
    const result = classifyTopics(
      [topic('Spring', 4), topic('Spring Boot', 5)],
      []
    );
    expect(result.classified.map((c) => [c.topic, c.currentCount])).toEqual([
      ['Spring', 4],
      ['Spring Boot', 5],
    ]);
  });

  it('別の期間の Spring と Spring Boot は別トピック（classifyTopics）', () => {
    // 併合すると件数が同じで「変化なし」になり、増減を取り違える
    const result = classifyTopics([topic('Spring Boot', 5)], [topic('spring', 5)]);
    expect(typeOf(result, 'Spring Boot')).toBe('new');
    expect(typeOf(result, 'spring')).toBe('deprecated');
    expect(result.updateCandidates).toHaveLength(0);
  });

  it('同じ期間・別の期間の Spring と Spring Boot は別トピック（reconcileTopics）', () => {
    const same = reconcileTopics([topic('Spring', 4), topic('Spring Boot', 5)], [], 30);
    expect(same.current.map((t) => [t.topic, t.count])).toEqual([
      ['Spring Boot', 5],
      ['Spring', 4],
    ]);

    const across = reconcileTopics([topic('Spring Boot', 5)], [topic('spring', 5)], 30);
    expect(across.current.map((t) => t.topic)).toEqual(['Spring Boot']);
    expect(across.baseline.map((t) => t.topic)).toEqual(['spring']);
  });

  it.each([...TOPIC_UNMERGED_ALIASES])(
    '%s は TAG_NORMALIZATION_MAP の正式名と別キーで、表記もそのまま',
    (alias) => {
      const target = TAG_NORMALIZATION_MAP[alias];
      expect(target).toBeDefined();
      expect(normalizeTopic(alias)).not.toBe(normalizeTopic(target));
      expect(canonicalTopicName(alias)).toBe(alias);
    }
  );

  it('除外していない同義語（rails → Ruby on Rails）は従来どおり併合する', () => {
    expect(normalizeTopic('rails')).toBe(normalizeTopic('Ruby on Rails'));
  });
});

describe('記事一覧のリンクで検索するタグ（issue #655 項目 5）', () => {
  it('正式名と、併合した別名を返す', () => {
    expect(topicSearchTags('JavaScript')).toEqual(['JavaScript', 'js']);
    expect(topicSearchTags('機械学習')).toEqual(['機械学習', 'ml', 'machinelearning']);
    // 保存済みの小文字の表示名からも同じ結果になる
    expect(topicSearchTags('javascript')).toEqual(['JavaScript', 'js']);
  });

  it('併合しない別名は含めない', () => {
    expect(topicSearchTags('Spring Boot')).toEqual(['Spring Boot']);
    expect(topicSearchTags('Next.js')).toEqual(['Next.js', 'nextjs']);
    expect(topicSearchTags('Node.js')).toEqual(['Node.js', 'nodejs']);
    expect(topicSearchTags('Spring')).toEqual(['Spring']);
  });

  it('マップに無いトピックはその名前だけ', () => {
    expect(topicSearchTags('Claude Code')).toEqual(['Claude Code']);
  });

  it('トレンド画面のリンクは OR 検索のタグにすべて入れる', () => {
    const href = topicSearchHref('JavaScript');
    const params = new URLSearchParams(href.slice(href.indexOf('?')));
    expect(params.get('tags')?.split(',')).toEqual(['JavaScript', 'js']);
    expect(params.get('tagMode')).toBe('OR');
  });
});
