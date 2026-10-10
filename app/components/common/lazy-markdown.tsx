'use client';

import type { Options } from 'react-markdown';
import { createLazyComponent } from './lazy-component';

/**
 * react-markdown と remark プラグイン（gzip で約40KB）は AI の回答を出すときだけ要るので、
 * ページの初回表示の JS に含めず、描くときに読む（Issue #718）
 */
const { Component: MarkdownRenderer, preload } = createLazyComponent(
  () => import('./markdown-renderer')
);

interface LazyMarkdownProps extends Options {
  /**
   * 書式なしで出す文字の変換。remark プラグインが描くときに消す目印などを、
   * 書式なしの表示でも消すために使う（既定はそのまま出す）
   */
  plainTextTransform?: (markdown: string) => string;
}

/** 読み込み中と読み込めなかったときは、回答を書式なしの文字で出す */
export function LazyMarkdown({
  plainTextTransform,
  ...props
}: LazyMarkdownProps) {
  const source = props.children ?? '';
  const plainText = (
    <p className="whitespace-pre-wrap">
      {plainTextTransform ? plainTextTransform(source) : source}
    </p>
  );
  return (
    <MarkdownRenderer
      {...props}
      fallback={plainText}
      errorFallback={plainText}
    />
  );
}

/** 質問を送った時点で読み始め、回答が届いたときに読み込みを待たずに描けるようにする */
export const preloadMarkdown = preload;
