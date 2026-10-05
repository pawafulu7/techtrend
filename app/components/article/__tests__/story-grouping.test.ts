/**
 * @jest-environment node
 */
import { groupArticlesByStory } from '@/app/components/article/story-grouping';

const a = (
  id: string,
  title: string,
  storyId: string | null = null,
  storySize: number | null = null,
  qualityScore = 50
) => ({ id, title, storyId, storySize, qualityScore });

describe('groupArticlesByStory', () => {
  it('同じストーリーの記事を1つにし、最初に出た位置に代表の記事を置く', () => {
    const groups = groupArticlesByStory([
      a('x', '単独'),
      a('m1', 'Sonnet 5.5 launches', 'rep', 3),
      a('y', '単独2'),
      a('rep', 'Sonnet 5.5を発表', 'rep', 3),
      a('m2', 'Sonnet 5.5 is here', 'rep', 3),
    ]);

    expect(groups.map((g) => [g.article.id, g.storyId, g.storySize])).toEqual([
      ['x', null, 1],
      ['rep', 'rep', 3],
      ['y', null, 1],
    ]);
  });

  it('代表がまだ読み込まれていなければ、日本語の記事を優先し、品質スコアの高い記事を出す', () => {
    const groups = groupArticlesByStory([
      a('en', 'Sonnet 5.5 launches', 'rep', 4, 90),
      a('ja-low', 'Sonnet 5.5を発表', 'rep', 4, 30),
      a('ja-high', 'Sonnet 5.5が登場', 'rep', 4, 60),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].article.id).toBe('ja-high');
    expect(groups[0].storySize).toBe(4);
  });

  it('storySize が 2 未満の記事はまとめない', () => {
    const groups = groupArticlesByStory([
      a('p', 'A', 's', 1),
      a('q', 'B', 's', null),
    ]);

    expect(groups.map((g) => g.storyId)).toEqual([null, null]);
  });

  it('読み込んだ記事が storySize より多ければ、読み込んだ数を出す', () => {
    const groups = groupArticlesByStory([
      a('r1', 'A', 'r1', 2),
      a('r2', 'B', 'r1', 2),
      a('r3', 'C', 'r1', 2),
    ]);

    expect(groups[0].storySize).toBe(3);
  });
});
