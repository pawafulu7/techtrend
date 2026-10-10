'use client';

import dynamic from 'next/dynamic';
import type { Options } from 'react-markdown';

/**
 * react-markdown と remark プラグイン（gzip で約40KB）は AI の回答を出すときだけ要るので、
 * ページの初回表示の JS に含めず、描くときに読む（Issue #718）
 */
export const LazyMarkdown = dynamic<Options>(
  () => import('./markdown-renderer')
);

/** 質問を送った時点で読み始め、回答が届いたときに読み込みを待たずに描けるようにする */
export function preloadMarkdown() {
  void import('./markdown-renderer');
}
