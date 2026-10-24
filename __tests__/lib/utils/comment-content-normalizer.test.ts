import { normalizeCommentContent } from '@/lib/utils/comment/comment-content-normalizer';

describe('normalizeCommentContent', () => {
  it('should handle empty input', () => {
    expect(normalizeCommentContent('')).toBe('');
    expect(normalizeCommentContent(null as any)).toBe('');
  });

  it('should keep markup-like text as written', () => {
    expect(normalizeCommentContent('<div> を使う')).toBe('<div> を使う');
    expect(normalizeCommentContent('if a<b then')).toBe('if a<b then');
    expect(normalizeCommentContent('a < b && c > d')).toBe('a < b && c > d');
    expect(
      normalizeCommentContent('&lt;script&gt;DROP&lt;/script&gt;KEEP')
    ).toBe('&lt;script&gt;DROP&lt;/script&gt;KEEP');
    expect(normalizeCommentContent('<script>alert("xss")</script>text')).toBe(
      '<script>alert("xss")</script>text'
    );
  });

  it('should collapse horizontal whitespace and keep up to two consecutive newlines', () => {
    expect(
      normalizeCommentContent('  line1\r\nline2\t\ttab\n\n\n\nend  ')
    ).toBe('line1\nline2 tab\n\nend');
  });

  it('should not let CR or whitespace-only lines exceed two consecutive newlines', () => {
    expect(normalizeCommentContent('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb');
    expect(normalizeCommentContent('a\rb')).toBe('a\nb');
    expect(normalizeCommentContent('a\n \n\t\n \nb')).toBe('a\n\nb');
    expect(normalizeCommentContent(' x \n y ')).toBe('x \n y');
  });

  it('should remove NUL characters', () => {
    expect(normalizeCommentContent('a\0b \0 c')).toBe('ab c');
  });

  it('should return its own output unchanged (idempotent)', () => {
    const inputs = [
      '&lt;script&gt;DROP&lt;/script&gt;KEEP',
      '&amp;lt;b&amp;gt;',
      '<iframe>'.repeat(9) + '<script>DROP</script>KEEP',
      'if a<b then',
      'AT&T &copy; 2024',
      '  line1\r\n\n\n\n  line2  end \0 ',
      '\n\n\n',
      'a\r\n \r\n\t\r\n\r\nb',
    ];

    inputs.forEach((input) => {
      const once = normalizeCommentContent(input);
      expect(normalizeCommentContent(once)).toBe(once);
    });
  });
});
