import {
  findFirstImageSrc,
  findImageUrlByPrefix,
  findOgImageUrl,
  findThumbnailInHtml,
} from '@/lib/fetchers/html-image';

describe('findOgImageUrl', () => {
  it('og:image の content を返す（大文字・単一引用符も読む）', () => {
    expect(
      findOgImageUrl(
        '<meta property="og:image" content="https://example.com/a.png">'
      )
    ).toBe('https://example.com/a.png');
    expect(
      findOgImageUrl(
        "<META PROPERTY='og:image' CONTENT='https://example.com/b.png'>"
      )
    ).toBe('https://example.com/b.png');
  });

  it('property より前の content は読まない（従来の正規表現と同じ）', () => {
    expect(
      findOgImageUrl(
        '<meta content="https://example.com/a.png" property="og:image">'
      )
    ).toBeNull();
  });

  it('og:image 以外の meta は読み飛ばす', () => {
    const html =
      '<meta property="og:title" content="t"><meta property="og:image" content="https://example.com/c.png">';
    expect(findOgImageUrl(html)).toBe('https://example.com/c.png');
  });
});

describe('findFirstImageSrc', () => {
  it('最初の img の src を返す（二重・単一引用符）', () => {
    expect(
      findFirstImageSrc(
        '<p>x</p><img src="https://example.com/1.png"><img src="https://example.com/2.png">'
      )
    ).toBe('https://example.com/1.png');
    expect(
      findFirstImageSrc("<img alt='a' src='https://example.com/3.png'>")
    ).toBe('https://example.com/3.png');
  });

  it('1 つのタグに src が複数あるときは最後のものを使う（data-src など。従来の最長一致と同じ）', () => {
    expect(
      findFirstImageSrc(
        '<img src="https://example.com/small.png" data-full-src="https://example.com/large.png">'
      )
    ).toBe('https://example.com/large.png');
  });

  it('src の無い img は読み飛ばし、srcset は src として読まない', () => {
    expect(
      findFirstImageSrc(
        '<img srcset="https://example.com/x.png 2x"><img src="https://example.com/y.png">'
      )
    ).toBe('https://example.com/y.png');
  });

  it('属性値の中の < でタグを打ち切らない（従来の正規表現と同じ）', () => {
    expect(
      findFirstImageSrc('<img alt="x < y" src="https://example.com/a.png">')
    ).toBe('https://example.com/a.png');
    expect(
      findOgImageUrl(
        '<meta name="a<b" property="og:image" content="https://example.com/og.png">'
      )
    ).toBe('https://example.com/og.png');
  });

  it('閉じていない末尾のタグも読む', () => {
    expect(
      findFirstImageSrc('本文<img src="https://example.com/tail.png" alt')
    ).toBe('https://example.com/tail.png');
  });

  it('画像が無ければ null', () => {
    expect(findFirstImageSrc('<p>no image</p>')).toBeNull();
    expect(findFirstImageSrc('')).toBeNull();
  });
});

describe('findThumbnailInHtml', () => {
  it('og:image を優先し、無ければ最初の img', () => {
    expect(
      findThumbnailInHtml(
        '<img src="https://example.com/img.png"><meta property="og:image" content="https://example.com/og.png">'
      )
    ).toBe('https://example.com/og.png');
    expect(findThumbnailInHtml('<img src="https://example.com/img.png">')).toBe(
      'https://example.com/img.png'
    );
  });

  // 配信元が細工した本文で、計算量が入力長の 2 乗に増えないこと（旧実装は 100KB で数秒かかった）
  it.each([
    ['<img が続き > が無い', '<img'.repeat(250_000)],
    [
      '<meta property="og:image" が続き > が無い',
      '<meta property="og:image"'.repeat(40_000),
    ],
    [
      '1 つのタグに property が続き content が無い',
      '<meta ' + 'property="og:image"'.repeat(50_000),
    ],
    ['1 つのタグに src=" が続き閉じない', '<img ' + 'src="'.repeat(200_000)],
  ])('%s 入力（約 1MB）でも 1 秒かからない', (_label, html) => {
    const start = performance.now();
    findThumbnailInHtml(html);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('findImageUrlByPrefix', () => {
  const DEEPMIND = ['.jpg', '.png', '.webp', '.svg'];
  const find = (text: string) =>
    findImageUrlByPrefix(text, 'https://deepmind.google', DEEPMIND);

  it('接頭辞から最後の拡張子までを返す（従来の最長一致と同じ）', () => {
    expect(find('see https://deepmind.google/a/b.png"')).toBe(
      'https://deepmind.google/a/b.png'
    );
    expect(find('https://deepmind.google/a.png?x=1.jpg&y')).toBe(
      'https://deepmind.google/a.png?x=1.jpg'
    );
  });

  it('大文字小文字を区別しない', () => {
    expect(find('HTTPS://DeepMind.Google/A.PNG')).toBe(
      'HTTPS://DeepMind.Google/A.PNG'
    );
  });

  it('接頭辞の . は文字どおりにだけ一致する（任意の 1 文字に一致しない）', () => {
    expect(
      findImageUrlByPrefix(
        'https://developerXnvidia.com/a.png',
        'https://developer.nvidia.com',
        ['.png']
      )
    ).toBeNull();
  });

  it('小文字にすると文字数が変わる文字（İ）を含んでも、位置がずれない', () => {
    expect(find('https://deepmind.google/İİ/a.png x')).toBe(
      'https://deepmind.google/İİ/a.png'
    );
  });

  it('接頭辞の直後の拡張子は読まない（接頭辞の後ろに 1 文字以上が要る）', () => {
    expect(find('https://deepmind.google.png')).toBeNull();
  });

  it('引用符・空白で並びが切れる。拡張子の無い並びは読み飛ばす', () => {
    expect(
      find("https://deepmind.google/page 'https://deepmind.google/i.webp'")
    ).toBe('https://deepmind.google/i.webp');
    expect(find('https://deepmind.google/page')).toBeNull();
  });

  // 従来の式は拡張子の無い並びで開始位置ごとに末尾まで読み直した（100KB で約 0.25 秒）
  it('拡張子の無い並びが続く入力（約 1MB）でも 1 秒かからない', () => {
    const start = performance.now();
    find('https://deepmind.google/a'.repeat(40_000));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
