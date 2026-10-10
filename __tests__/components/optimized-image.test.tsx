import { render, screen, fireEvent } from '@testing-library/react';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { canOptimizeImage } from '@/lib/utils/article/thumbnail';

// next/image に渡した props を見るため、unoptimized を属性に写す。
// 最適化するときは本物と同じく /_next/image の URL を src にする
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    unoptimized,
    onError,
  }: {
    src: string;
    alt: string;
    unoptimized?: boolean;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={
        unoptimized
          ? src
          : `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`
      }
      alt={alt}
      data-unoptimized={String(!!unoptimized)}
      onError={onError}
    />
  ),
}));

const HTTPS = 'https://example.com/thumb.jpg';

describe('canOptimizeImage', () => {
  it.each([
    [HTTPS, true],
    ['https://example.com/logo.SVG', false],
    ['http://example.com/thumb.jpg', false],
    ['data:image/png;base64,AAAA', false],
    ['/static/local.png', false],
  ])('%s -> %s', (src, expected) => {
    expect(canOptimizeImage(src)).toBe(expected);
  });
});

describe('OptimizedImage', () => {
  it('optimizes https images and leaves http, svg and data: as they are', () => {
    const { rerender } = render(<OptimizedImage src={HTTPS} alt="a" fill />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'data-unoptimized',
      'false'
    );

    rerender(<OptimizedImage src="http://example.com/t.jpg" alt="a" fill />);
    expect(screen.getByRole('img')).toHaveAttribute('data-unoptimized', 'true');

    rerender(<OptimizedImage src="https://example.com/t.svg" alt="a" fill />);
    expect(screen.getByRole('img')).toHaveAttribute('data-unoptimized', 'true');
  });

  it('falls back to the original URL after an optimizer error, then to the placeholder', () => {
    const onError = jest.fn();
    render(<OptimizedImage src={HTTPS} alt="a" fill onError={onError} />);
    const img = screen.getByRole('img');

    // 1 回目の失敗（402 など）: 元の URL をそのまま読み直す。親にはまだ知らせない
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', HTTPS);
    expect(img).toHaveAttribute('data-unoptimized', 'true');
    expect(onError).not.toHaveBeenCalled();

    // 2 回目の失敗: プレースホルダーに替え、親に知らせる
    fireEvent.error(img);
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(onError).toHaveBeenCalledTimes(1);

    // それ以上は何もしない
    fireEvent.error(img);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports an http image failure to the parent right away', () => {
    const onError = jest.fn();
    render(
      <OptimizedImage
        src="http://example.com/t.jpg"
        alt="a"
        fill
        onError={onError}
      />
    );
    fireEvent.error(screen.getByRole('img'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img').getAttribute('src')).toMatch(/^data:/);
  });

  it('starts over when the src changes', () => {
    const { rerender } = render(<OptimizedImage src={HTTPS} alt="a" fill />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute('data-unoptimized', 'true');

    rerender(
      <OptimizedImage src="https://example.com/other.jpg" alt="a" fill />
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'data-unoptimized',
      'false'
    );
  });
});
