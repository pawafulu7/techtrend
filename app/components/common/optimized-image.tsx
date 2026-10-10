'use client';

import Image from 'next/image';
import { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  sizes?: string;
  fill?: boolean;
  style?: React.CSSProperties;
  quality?: number;
  onError?: () => void;
}

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2UyZThmMCIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY0NzQ4YiI+SW1hZ2U8L3RleHQ+PC9zdmc+';

/**
 * 画像の読み込みの段階。
 * optimized: /_next/image 経由（表示幅に合わせた WebP/AVIF）
 * original: 最適化に失敗したので、元の URL をそのまま出す
 * failed: 元の URL でも読めなかったので、プレースホルダーを出す
 */
type LoadStage = 'optimized' | 'original' | 'failed';

/**
 * /_next/image で最適化できる URL か。
 * remotePatterns は https だけなので http は最適化しない（next/image が例外を投げる）。
 * SVG は最適化しない（dangerouslyAllowSVG を有効にしないため）
 */
export function canOptimizeImage(src: string): boolean {
  if (!src.startsWith('https://')) return false;
  try {
    return !new URL(src).pathname.toLowerCase().endsWith('.svg');
  } catch {
    return false;
  }
}

/**
 * 外部の画像を next/image で出す（Issue #718）
 * - https の画像は /_next/image 経由で、表示幅に合わせた WebP/AVIF にする（next.config.ts の images）
 * - http・data:・SVG はそのまま出す
 * - 最適化に失敗したら（Hobby の変換枠を超えたときの 402、取得の失敗など）元の URL をそのまま出し、
 *   それも読めなかったらプレースホルダーを出して onError を呼ぶ
 */
export function OptimizedImage({
  src,
  alt,
  width = 300,
  height = 200,
  priority = false,
  className = '',
  sizes,
  fill = false,
  style,
  quality = 75,
  onError,
}: OptimizedImageProps) {
  const [stage, setStage] = useState<LoadStage>('optimized');
  const [prevSrc, setPrevSrc] = useState(src);

  // src が変わったら最初の段階に戻す（useEffect ではなくレンダリング中に導出）
  if (src !== prevSrc) {
    setPrevSrc(src);
    setStage('optimized');
  }

  const optimizable = canOptimizeImage(src);
  const imgSrc = stage === 'failed' ? PLACEHOLDER_IMAGE : src;
  const unoptimized = !optimizable || stage !== 'optimized';

  const handleError = () => {
    if (stage === 'optimized' && optimizable) {
      setStage('original');
      return;
    }
    if (stage !== 'failed') {
      setStage('failed');
      onError?.();
    }
  };

  // alt は spread に入れず明示する（jsx-a11y/alt-text が spread の中を見ないため）
  const shared = {
    src: imgSrc,
    priority,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    className,
    style,
    quality,
    unoptimized,
    onError: handleError,
  };

  if (fill) {
    return (
      <Image
        {...shared}
        alt={alt}
        fill
        sizes={
          sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        }
      />
    );
  }

  return (
    <Image
      {...shared}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes || `(max-width: 768px) 100vw, ${width}px`}
    />
  );
}

/**
 * 記事サムネイル用の最適化された画像コンポーネント
 */
export function ArticleThumbnail({
  src,
  alt,
  priority = false,
  className = '',
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-video overflow-hidden bg-[var(--tt-color-surface-muted)] ${className}`}
    >
      <OptimizedImage
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover"
        quality={75}
      />
    </div>
  );
}

/**
 * プロフィール画像用の最適化された画像コンポーネント
 */
export function ProfileImage({
  src,
  alt,
  size = 40,
  className = '',
}: {
  src: string;
  alt: string;
  size?: number;
  className?: string;
}) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
      quality={90}
    />
  );
}
