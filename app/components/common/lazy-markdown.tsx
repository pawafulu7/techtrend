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

/** 読み込み中と読み込めなかったときは、回答を書式なしの文字で出す */
export function LazyMarkdown(props: Options) {
  const plainText = <p className="whitespace-pre-wrap">{props.children}</p>;
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
