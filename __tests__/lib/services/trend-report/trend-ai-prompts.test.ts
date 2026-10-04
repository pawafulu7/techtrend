import { describe, it, expect } from '@jest/globals';
import { TrendPeriodType } from '@/lib/prisma-exports';
import {
  formatPeriodLabel,
  buildStructuredPrompt,
  buildRepairPrompt,
  buildLegacyPrompt,
} from '@/lib/services/trend-report/trend-ai-prompts';
import {
  hasRelativeTimeWord,
  validateV2Content,
} from '@/lib/services/trend-report/trend-ai-validators';
import {
  getDayRangeJST,
  getWeekRangeJST,
  getMonthRangeJST,
} from '@/lib/services/trend-report/trend-data-aggregator';

/** JST の日時を Date にする */
function jst(dateTime: string): Date {
  return new Date(`${dateTime}+09:00`);
}

describe('formatPeriodLabel（issue #721）', () => {
  it('日次は対象日（JST）を年月日で表す', () => {
    const { start, end } = getDayRangeJST(jst('2026-10-04T00:30:00'));
    expect(formatPeriodLabel(TrendPeriodType.DAILY, start, end)).toBe(
      '2026年10月4日'
    );
  });

  it('週次は月曜から日曜までを表す', () => {
    const { start, end } = getWeekRangeJST(jst('2026-10-01T12:00:00'));
    expect(formatPeriodLabel(TrendPeriodType.WEEKLY, start, end)).toBe(
      '2026年9月28日〜10月4日の週'
    );
  });

  it('年をまたぐ週は終わりの日にも年を付ける', () => {
    const { start, end } = getWeekRangeJST(jst('2026-12-30T12:00:00'));
    expect(formatPeriodLabel(TrendPeriodType.WEEKLY, start, end)).toBe(
      '2026年12月28日〜2027年1月3日の週'
    );
  });

  it('月次は年月を表す', () => {
    const { start, end } = getMonthRangeJST(jst('2026-09-15T12:00:00'));
    expect(formatPeriodLabel(TrendPeriodType.MONTHLY, start, end)).toBe(
      '2026年9月'
    );
  });
});

describe('生成プロンプトの時点の言葉（issue #721）', () => {
  const LABEL = '2026年10月4日';

  it('構造化プロンプトは対象期間を日付で示し、時点の言葉を禁じる', () => {
    const prompt = buildStructuredPrompt(LABEL, { periodLabel: LABEL });
    expect(prompt).toContain('2026年10月4日の「意味のある分析」');
    expect(prompt).toContain('対象期間は2026年10月4日');
    expect(prompt).toContain('読む時点で意味が変わる言葉を使わない');
    // 比較元の basis.periodLabel（「前日」）と取り違えないよう、キー名でなく日付で示す
    expect(prompt).toContain('対象期間を指すときは「2026年10月4日」と書く');
    // core の指示が「今日の核心」と書かせない
    expect(prompt).not.toContain('今日の核心');
    expect(prompt).toContain('"core": "対象期間の核心');
  });

  it('修正プロンプトと旧形式のプロンプトにも対象期間と同じ禁止を入れる', () => {
    // 修正は初回と別の呼び出しなので、対象期間を渡さないと「今日」を何日に直すか分からない
    const repair = buildRepairPrompt(['err'], '{}', 'A1=x', LABEL);
    expect(repair).toContain('対象期間は2026年10月4日');
    expect(repair).toContain('読む時点で意味が変わる言葉を使わない');
    const legacy = buildLegacyPrompt(LABEL, []);
    expect(legacy).toContain('期間: 2026年10月4日');
    expect(legacy).toContain('読む時点で意味が変わる言葉を使わない');
  });
});

describe('時点の言葉の検査（issue #721）', () => {
  const VALID = {
    version: 'trend_ai_summary_v2',
    core: 'Claude Codeのプラグイン機能で開発の自動化が進む',
    overview:
      '2026年10月4日の技術動向は、Claude Codeのプラグインが中心でした。まずは手元のリポジトリで試してみてください。',
    keyTopics: [
      {
        topic: 'プラグイン',
        whatHappened: 'Claude Codeのプラグイン機能が公開された。',
        whyItMatters: '定型作業をチームで共有できる。',
        evidenceArticleIds: ['A1'],
      },
    ],
    actions: [{ action: '試す', reason: '手順が短い', articleIds: ['A1'] }],
  };

  it('時点の言葉が無ければ通す', () => {
    expect(validateV2Content(VALID)).toEqual([]);
  });

  it.each([
    ['core', { core: '今日の核心はClaude Codeのプラグイン' }],
    ['overview', { overview: '本日の技術動向はプラグインが中心です。' }],
    [
      'keyTopics',
      {
        keyTopics: [
          { ...VALID.keyTopics[0], whyItMatters: '今週から使える。' },
        ],
      },
    ],
  ])('%s に時点の言葉があれば修正に回す', (field, patch) => {
    const errors = validateV2Content({ ...VALID, ...patch });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('relative time words');
    expect(errors[0]).toContain(field);
  });

  it.each(['今日', '本日', '昨日', '今週', '今月'])(
    '「%s」を検出する',
    (word) => {
      expect(hasRelativeTimeWord(`${word}の動向`)).toBe(true);
    }
  );

  it('対象期間の日付は検出しない', () => {
    expect(hasRelativeTimeWord('2026年10月4日の動向')).toBe(false);
  });
});
