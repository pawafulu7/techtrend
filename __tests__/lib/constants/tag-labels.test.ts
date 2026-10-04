import {
  findTagNamesByAlias,
  expandTagSearchNames,
  getTagDisplayName,
} from '@/lib/constants/tag-labels';

describe('タグの表示名と別名検索', () => {
  it('完全一致と前方一致で正式名を返し、前後の空白を除く', () => {
    expect(findTagNamesByAlias('  サイバー  ')).toEqual(['Cybersecurity']);
    expect(findTagNamesByAlias('サイバーセキュリティ')).toEqual([
      'Cybersecurity',
    ]);
    expect(findTagNamesByAlias('セキュリティ')).toEqual(['Security']);
    expect(findTagNamesByAlias('機関')).toEqual([]);
    expect(findTagNamesByAlias('捜査')).toEqual(['Law Enforcement']);
    expect(findTagNamesByAlias('   ')).toEqual([]);
  });

  it('未登録の名前は維持し、正式名を変更せず表示・検索に別名を使う', () => {
    expect(getTagDisplayName('cybersecurity')).toBe('サイバーセキュリティ');
    expect(getTagDisplayName('React')).toBe('React');
    expect(expandTagSearchNames(['サイバーセキュリティ', 'React'])).toEqual([
      'サイバーセキュリティ',
      'Cybersecurity',
      'React',
    ]);
  });
});
