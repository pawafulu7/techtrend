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

/**
 * 最適化された画像コンポーネント
 * - WebP/AVIF自動変換
 * - 遅延ロード（priorityがfalseの場合）
 * - レスポンシブ対応
 * - エラーハンドリング
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
  onError
}: OptimizedImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  // デフォルトのplaceholder画像（Base64エンコード）
  const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2UyZThmMCIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY0NzQ4YiI+SW1hZ2U8L3RleHQ+PC9zdmc+';

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      setImgSrc(placeholderImage);
      onError?.();
    }
  };

  // 外部URLの場合はそのまま使用、相対パスの場合は調整
  const imageSrc = imgSrc.startsWith('http') || imgSrc.startsWith('data:') 
    ? imgSrc 
    : imgSrc;

  // fillモードの場合
  if (fill) {
    return (
      <Image
        src={imageSrc}
        alt={alt}
        fill
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        className={className}
        style={style}
        sizes={sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'}
        quality={quality}
        onError={handleError}
        unoptimized={imageSrc.startsWith('data:') || hasError}
      />
    );
  }

  // 通常モード（width/height指定）
  return (
    <Image
      src={imageSrc}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      loading={priority ? 'eager' : 'lazy'}
      className={className}
      style={style}
      sizes={sizes || `(max-width: 768px) 100vw, ${width}px`}
      quality={quality}
      onError={handleError}
      unoptimized={imageSrc.startsWith('data:') || hasError}
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
  className = ''
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative aspect-video overflow-hidden bg-gray-100 ${className}`}>
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
  className = ''
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
      sizes={`${size}px`}
      quality={90}
    />
  );
}