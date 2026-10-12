import { normalizeInquiryMessage } from '../normalize';

describe('normalizeInquiryMessage', () => {
  it('前後の空白を除く', () => {
    expect(normalizeInquiryMessage('  本文  \n')).toBe('本文');
  });

  it('空白だけ・制御文字だけの本文は空文字になる', () => {
    expect(normalizeInquiryMessage(' \n\t ')).toBe('');
    expect(normalizeInquiryMessage('\u0000\u0007\u001F')).toBe('');
  });

  it('CRLF と CR を LF にそろえる', () => {
    expect(normalizeInquiryMessage('一行目\r\n二行目\r三行目')).toBe(
      '一行目\n二行目\n三行目'
    );
  });

  it('改行とタブは残す', () => {
    expect(normalizeInquiryMessage('a\n\tb')).toBe('a\n\tb');
  });

  it('NUL・C0・DEL・C1 の制御文字を除く', () => {
    expect(
      normalizeInquiryMessage(
        'a\u0000b\u0008c\u000Bd\u001Fe\u007Ff\u0085g\u009Fh'
      )
    ).toBe('abcdefgh');
  });

  it('双方向テキストの制御文字を除く', () => {
    expect(normalizeInquiryMessage('x\u202Ay\u202Ez\u2066w\u2069v')).toBe('xyzwv');
  });

  it('方向の印（LRM・RLM・ALM）とゼロ幅の文字を除く', () => {
    expect(
      normalizeInquiryMessage(
        'a\u200Eb\u200Fc\u061Cd\u200Be\u200Cf\u200Dg\u2060h\uFEFFi'
      )
    ).toBe('abcdefghi');
  });

  it('ゼロ幅の文字だけの本文は空文字になる', () => {
    expect(normalizeInquiryMessage('\u200B\u200B\uFEFF')).toBe('');
  });

  it('HTML タグは除かない（コード片を残す）', () => {
    const code = '<div class="a">\n  <script>alert(1)</script>\n</div>';
    expect(normalizeInquiryMessage(code)).toBe(code);
  });

  it('日本語と絵文字はそのまま', () => {
    expect(normalizeInquiryMessage('ダークモードがほしい 🌙')).toBe(
      'ダークモードがほしい 🌙'
    );
  });
});
