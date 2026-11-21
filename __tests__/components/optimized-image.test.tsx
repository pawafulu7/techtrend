import { act, render, screen, fireEvent } from '@testing-library/react';
import type { Ref } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { canOptimizeImage } from '@/lib/articles/thumbnail';

// next/image に渡した props を見るため、unoptimized・loading・fetchPriority・preload を属性に写す。
// 最適化するときは本物と同じく /_next/image の URL を src にする。ref は本物と同じく <img> に渡す
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    ref,
    src,
    alt,
    unoptimized,
    className,
    loading,
    fetchPriority,
    preload,
    onLoad,
    onError,
  }: {
    ref?: Ref<HTMLImageElement>;
    src: string;
    alt: string;
    unoptimized?: boolean;
    className?: string;
    loading?: string;
    fetchPriority?: string;
    preload?: boolean;
    onLoad?: () => void;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={
        unoptimized
          ? src
          : `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`
      }
      alt={alt}
      className={className}
      data-unoptimized={String(!!unoptimized)}
      data-loading={loading ?? 'none'}
      data-fetch-priority={fetchPriority ?? 'none'}
      data-preload={String(!!preload)}
      onLoad={onLoad}
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

    // 1 回目の失敗（402 など）: 元の URL をそのまま読み直す。親にはまだ知らせない。
    // 段階ごとに <img> を作り直すので、要素は取り直す
    fireEvent.error(screen.getByRole('img'));
    const original = screen.getByRole('img');
    expect(original).toHaveAttribute('src', HTTPS);
    expect(original).toHaveAttribute('data-unoptimized', 'true');
    expect(onError).not.toHaveBeenCalled();

    // 2 回目の失敗: 画像をやめて代わりの表示（方眼にアイコン）に替え、親に知らせる
    fireEvent.error(original);
    expect(original).not.toBeInTheDocument();
    expect(screen.getByTestId('image-fallback')).toHaveAttribute(
      'aria-label',
      'a'
    );
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
    expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
  });

  it('hides the fallback from screen readers when the image is decorative', () => {
    render(<OptimizedImage src="http://example.com/t.jpg" alt="" fill />);
    fireEvent.error(document.querySelector('img')!);
    const fallback = screen.getByTestId('image-fallback');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
    expect(fallback).not.toHaveAttribute('role');
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

  it('keeps an image created after hydration transparent until it loads, then shows it', () => {
    const { container } = render(<OptimizedImage src={HTTPS} alt="a" fill />);
    const img = screen.getByRole('img');
    const frame = container.querySelector('.thumb-loading');

    // 読み込み中: 画像は透明で、後ろに読み込み中の枠がある
    expect(img).toHaveClass('opacity-0');
    expect(frame).not.toHaveAttribute('data-done');

    // 読めたら表示し、枠は消える側に回す
    fireEvent.load(img);
    expect(img).not.toHaveClass('opacity-0');
    expect(frame).toHaveAttribute('data-done', 'true');
  });

  it('goes back to loading when the src changes', () => {
    const { rerender } = render(<OptimizedImage src={HTTPS} alt="a" fill />);
    fireEvent.load(screen.getByRole('img'));
    expect(screen.getByRole('img')).not.toHaveClass('opacity-0');

    rerender(
      <OptimizedImage src="https://example.com/other.jpg" alt="a" fill />
    );
    expect(screen.getByRole('img')).toHaveClass('opacity-0');
  });

  it('waits for the new image when the src goes A -> B -> A (does not reuse the first load of A)', () => {
    const OTHER = 'https://example.com/other.jpg';
    const { container, rerender } = render(
      <OptimizedImage src={HTTPS} alt="a" fill />
    );
    fireEvent.load(screen.getByRole('img'));
    rerender(<OptimizedImage src={OTHER} alt="a" fill />);
    rerender(<OptimizedImage src={HTTPS} alt="a" fill />);

    expect(screen.getByRole('img')).toHaveClass('opacity-0');
    expect(container.querySelector('.thumb-loading')).not.toHaveAttribute(
      'data-done'
    );
  });

  it('fades in the original URL after an optimizer error instead of showing it half-loaded', () => {
    render(<OptimizedImage src={HTTPS} alt="a" fill />);
    fireEvent.error(screen.getByRole('img'));
    const original = screen.getByRole('img');
    expect(original).toHaveAttribute('src', HTTPS);
    expect(original).toHaveClass('opacity-0');
    fireEvent.load(original);
    expect(original).not.toHaveClass('opacity-0');
  });

  it('ignores a load notice from the previous image after the src changes', () => {
    const { rerender } = render(<OptimizedImage src={HTTPS} alt="a" fill />);
    const previous = screen.getByRole('img');
    rerender(
      <OptimizedImage src="https://example.com/other.jpg" alt="a" fill />
    );

    // 前の画像の読み込み（decode）が後から終わっても、新しい画像は読めるまで透明のまま
    fireEvent.load(previous);
    expect(screen.getByRole('img')).toHaveClass('opacity-0');
  });

  it('does not hide server-rendered images (they may finish loading before hydration)', () => {
    const html = renderToString(<OptimizedImage src={HTTPS} alt="a" fill />);
    expect(html).not.toContain('opacity-0');
    expect(html).toContain('thumb-loading');
  });

  describe('hydration', () => {
    // 失敗したテストでも置いた HTML を残さない（残すと後のテストに <img> が2枚見える）
    const containers: HTMLElement[] = [];
    afterEach(() => {
      containers.splice(0).forEach((c) => c.remove());
    });

    /** サーバーの HTML を置いてからハイドレーションする。naturalWidth はハイドレーションの前に決める */
    async function hydrate(naturalWidth: number) {
      const element = <OptimizedImage src={HTTPS} alt="a" fill />;
      const container = document.createElement('div');
      container.innerHTML = renderToString(element);
      document.body.appendChild(container);
      containers.push(container);
      const img = container.querySelector('img')!;
      Object.defineProperty(img, 'naturalWidth', {
        configurable: true,
        get: () => naturalWidth,
      });
      await act(async () => {
        hydrateRoot(container, element);
      });
      return { img, frame: container.querySelector('.thumb-loading') };
    }

    it('keeps an image that was already drawn before hydration visible, without a fade', async () => {
      const { img, frame } = await hydrate(400);
      expect(img).not.toHaveClass('opacity-0');
      expect(img).toHaveClass('transition-none');
      expect(frame).toHaveAttribute('data-done', 'true');
    });

    it('hides an image that had not arrived yet at once (no fade-out), then shows it when it loads', async () => {
      const { img, frame } = await hydrate(0);
      expect(img).toHaveClass('opacity-0');
      expect(img).toHaveClass('transition-none');
      expect(frame).not.toHaveAttribute('data-done');

      fireEvent.load(img);
      expect(img).not.toHaveClass('opacity-0');
      expect(frame).toHaveAttribute('data-done', 'true');
    });
  });

  it('lazy-loads by default and passes eager loading and fetch priority through', () => {
    const { rerender } = render(<OptimizedImage src={HTTPS} alt="a" fill />);
    expect(screen.getByRole('img')).toHaveAttribute('data-loading', 'lazy');

    rerender(
      <OptimizedImage
        src={HTTPS}
        alt="a"
        fill
        loading="eager"
        fetchPriority="high"
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute('data-loading', 'eager');
    expect(screen.getByRole('img')).toHaveAttribute(
      'data-fetch-priority',
      'high'
    );
  });

  it('does not pass loading together with preload (next/image rejects preload with lazy)', () => {
    render(<OptimizedImage src={HTTPS} alt="a" fill preload />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('data-preload', 'true');
    expect(img).toHaveAttribute('data-loading', 'none');
  });
});
