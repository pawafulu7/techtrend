'use client';

import Image from 'next/image';
import { useState, type SyntheticEvent } from 'react';
import { canOptimizeImage } from '@/lib/utils/article/thumbnail';

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
  /** 元の URL をそのまま出すとき（http・SVG・最適化の失敗後）に外部ホストへ送る Referer の扱い */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
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
  referrerPolicy,
  onError,
}: OptimizedImageProps) {
  const [stage, setStage] = useState<LoadStage>('optimized');
  const [prevSrc, setPrevSrc] = useState(src);

  // src が変わったら最初の段階に戻す（useEffect ではなくレンダリング中に導出）
  if (src !== prevSrc) {
    setPrevSrc(src);
    setStage('optimized');
  }

  const imgSrc = stage === 'failed' ? PLACEHOLDER_IMAGE : src;
  const unoptimized = !canOptimizeImage(src) || stage !== 'optimized';

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    // 失敗したのが /_next/image なら、元の URL で読み直す。stage ではなく実際の src で判定するのは、
    // next/image が自分の判断で unoptimized にしたとき（.svg など）に読み直しが空振りしないようにするため
    const failedViaOptimizer = (
      event.currentTarget.getAttribute('src') ?? ''
    ).includes('/_next/image');
    if (failedViaOptimizer && stage === 'optimized') {
      setStage('original');
      return;
    }
    if (stage !== 'failed') {
      setStage('failed');
      onError?.();
    }
  };

  // alt は spread に入れず明示する（jsx-a11y/alt-text が spread の中を見ないため）。
  // quality は渡さない。next.config.ts の qualities は [75] だけで、ほかの値は 400 になる
  const shared = {
    src: imgSrc,
    priority,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    className,
    style,
    referrerPolicy,
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
