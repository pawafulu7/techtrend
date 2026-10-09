import type { Components } from 'react-markdown';

/**
 * 回答などの Markdown の「#」を h2 で描画する（ページの h1 は画面の見出しだけにする。Issue #700）。
 * 「##」以降は変えない。全体を1段ずつ下げると、h5・h6 に typography のスタイルが無く、
 * 見出しの見た目が本文と同じになったり、どの段も1段小さくなったりするため
 */
export const shiftedMarkdownHeadings: Components = {
  h1: ({ node: _node, ...props }) => <h2 {...props} />,
};
