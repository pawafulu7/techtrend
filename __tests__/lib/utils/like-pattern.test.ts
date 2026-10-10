import {
  containsFilter,
  escapeLikePattern,
  hasCaseVariants,
} from '@/lib/utils/like-pattern';

describe('escapeLikePattern', () => {
  it('% と _ の前に \\ を付ける', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('\\ 自体もエスケープする', () => {
    expect(escapeLikePattern('C:\\')).toBe('C:\\\\');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('\\ とワイルドカードが続いても、それぞれ 1 回ずつエスケープする', () => {
    // 入力 `\%` → `\\` + `\%`。`\` を後から置換すると `\\\\%` のように壊れる
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });

  it('ワイルドカードのみの入力もすべてエスケープする', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('%%__')).toBe('\\%\\%\\_\\_');
  });

  it('特殊文字を含まない値はそのまま返す', () => {
    expect(escapeLikePattern('')).toBe('');
    expect(escapeLikePattern('React Hooks')).toBe('React Hooks');
    expect(escapeLikePattern('生成AI')).toBe('生成AI');
  });
});

describe('hasCaseVariants', () => {
  it('大文字小文字の形がある文字を含む語だけ true', () => {
    expect(hasCaseVariants('React')).toBe(true);
    expect(hasCaseVariants('go')).toBe(true);
    expect(hasCaseVariants('C#')).toBe(true);
    expect(hasCaseVariants('Ａｂ')).toBe(true); // 全角英字
    expect(hasCaseVariants('設計')).toBe(false);
    expect(hasCaseVariants('テスト')).toBe(false);
    expect(hasCaseVariants('ひらがな')).toBe(false);
    expect(hasCaseVariants('2026')).toBe(false);
    expect(hasCaseVariants('100%_')).toBe(false);
  });

  it('Unicode の特殊な大文字小文字も検出する（ILIKE 側に残す）', () => {
    expect(hasCaseVariants('ß')).toBe(true); // 大文字が SS
    expect(hasCaseVariants('ſ')).toBe(true); // 長い s（大文字は S）
    expect(hasCaseVariants('\u212a')).toBe(true); // ケルビン記号（小文字は k）
    expect(hasCaseVariants('ǅ')).toBe(true); // タイトルケース
    expect(hasCaseVariants('\u{10400}')).toBe(true); // サロゲートペア（Deseret）
    expect(hasCaseVariants('é')).toBe(true);
  });

  it('大文字小文字の無い記号・絵文字・半角カナは false', () => {
    expect(hasCaseVariants('🎉')).toBe(false);
    expect(hasCaseVariants('１２')).toBe(false); // 全角数字
    expect(hasCaseVariants('ﾀﾞ')).toBe(false); // 半角カナ
    expect(hasCaseVariants('ー々')).toBe(false);
  });
});

describe('containsFilter', () => {
  it('英字を含む語はエスケープして ILIKE（mode: insensitive）にする', () => {
    expect(containsFilter('React')).toEqual({
      contains: 'React',
      mode: 'insensitive',
    });
    expect(containsFilter('a_b%')).toEqual({
      contains: 'a\\_b\\%',
      mode: 'insensitive',
    });
  });

  it('かな・漢字・数字・記号だけの語はエスケープして LIKE（mode なし）にする（#717）', () => {
    expect(containsFilter('設計')).toEqual({ contains: '設計' });
    expect(containsFilter('100%_')).toEqual({ contains: '100\\%\\_' });
  });

  it('結合文字を含む語は ILIKE のままにする（ICU の İ → i + U+0307 に備える）', () => {
    expect(containsFilter('\u0307')).toEqual({
      contains: '\u0307',
      mode: 'insensitive',
    });
    expect(containsFilter('か\u3099')).toEqual({
      contains: 'か\u3099',
      mode: 'insensitive',
    });
  });
});
