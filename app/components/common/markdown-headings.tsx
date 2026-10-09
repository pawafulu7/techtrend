import type { Components } from 'react-markdown';

/**
 * 回答などの Markdown の見出しを1段ずつ下げる（# → h2、## → h3 … ###### → h6）。
 * ページの h1 は画面の見出しだけにしつつ、Markdown の中の見出しの親子関係は保つ（Issue #700）
 */
export const shiftedMarkdownHeadings: Components = {
  h1: ({ node: _node, ...props }) => <h2 {...props} />,
  h2: ({ node: _node, ...props }) => <h3 {...props} />,
  h3: ({ node: _node, ...props }) => <h4 {...props} />,
  h4: ({ node: _node, ...props }) => <h5 {...props} />,
  h5: ({ node: _node, ...props }) => <h6 {...props} />,
  h6: ({ node: _node, ...props }) => <h6 {...props} />,
};
