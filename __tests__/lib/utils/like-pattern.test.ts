import { escapeLikePattern } from '@/lib/utils/like-pattern';

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
