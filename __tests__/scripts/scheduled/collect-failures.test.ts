/**
 * 収集のジョブを失敗として終わらせる条件（scripts/scheduled/utils/collect-failures.ts）のテスト
 */

import { SourceFormatError } from '@/lib/fetchers/errors';
import {
  countSourceFormatErrors,
  describeCollectFailures,
  findUnregisteredSources,
} from '@/scripts/scheduled/utils/collect-failures';

describe('findUnregisteredSources', () => {
  const rows = [
    { id: 'hacker_news_202508', name: 'Hacker News', enabled: true },
    { id: 'mercari_tech_blog', name: 'Mercari Engineering', enabled: false },
  ];

  it('名前でも id でも指定できる。DB に行があれば missing にしない', () => {
    expect(findUnregisteredSources(['Hacker News', 'hacker_news_202508'], rows)).toEqual({ missing: [], disabled: [] });
  });

  it('DB に行が無い名前は missing、行はあるが無効のものは disabled に分ける', () => {
    expect(findUnregisteredSources(['DeepMind Blog', 'Mercari Engineering', 'Hacker News'], rows)).toEqual({
      missing: ['DeepMind Blog'],
      disabled: ['Mercari Engineering'],
    });
  });

  it('同じ名前を2回指定しても1回だけ数える。指定が無ければ何も無い', () => {
    expect(findUnregisteredSources(['X', 'X'], []).missing).toEqual(['X']);
    expect(findUnregisteredSources([], rows)).toEqual({ missing: [], disabled: [] });
  });
});

describe('countSourceFormatErrors', () => {
  it('SourceFormatError だけを数え、ネットワークの失敗などは数えない', () => {
    expect(
      countSourceFormatErrors([
        new SourceFormatError('template changed'),
        new Error('ECONNRESET'),
        new SourceFormatError('another issue'),
      ])
    ).toBe(2);
    expect(countSourceFormatErrors([new Error('HTTP 503')])).toBe(0);
  });
});

describe('describeCollectFailures', () => {
  it('どちらも無ければ空（ジョブは成功）', () => {
    expect(describeCollectFailures([], [])).toEqual([]);
  });

  it('DB に無いソースと、形式が変わったソースを、それぞれ1つの理由にする', () => {
    const messages = describeCollectFailures(['DeepMind Blog', 'Rails Releases'], ['JavaScript Weekly']);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('DeepMind Blog, Rails Releases');
    expect(messages[1]).toContain('JavaScript Weekly');
  });
});
