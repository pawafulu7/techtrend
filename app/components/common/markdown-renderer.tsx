'use client';

import ReactMarkdown, { type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

/**
 * GFM と改行の remark プラグインを有効にした Markdown 表示。
 * 直接 import せず、lazy-markdown.tsx の LazyMarkdown から読む（Issue #718）
 */
export default function MarkdownRenderer({ remarkPlugins, ...props }: Options) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks, ...(remarkPlugins ?? [])]}
      {...props}
    />
  );
}
