/**
 * CommentItem: メモの本文は HTML として扱わず、書いたとおりに保存する（issue #823）。
 * その前提として、本文がテキストとしてだけ描画され、タグやスクリプトにならないことを確かめる
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CommentItem } from '@/app/components/comment/comment-item';
import type { CommentResponse } from '@/app/components/comment/types';

const MARKUP_CONTENT =
  '<img src=x onerror="window.__xss=1"></textarea><script>window.__xss=1</script> &lt;div&gt; if a<b && c>d';

function buildComment(content: string): CommentResponse {
  return {
    id: 'comment-1',
    articleId: 'article-1',
    userId: 'user-1',
    content,
    visibility: 'PRIVATE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('CommentItem', () => {
  it('renders markup-like content as text without creating elements', () => {
    const { container } = render(
      <CommentItem
        comment={buildComment(MARKUP_CONTENT)}
        isOwner={false}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const paragraph = container.querySelector('p');
    expect(paragraph).toHaveTextContent(MARKUP_CONTENT, {
      normalizeWhitespace: false,
    });
    expect(container.querySelector('img, script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('puts the stored content into the edit field and keeps it when appending', async () => {
    const user = userEvent.setup();
    const onUpdate = jest
      .fn()
      .mockResolvedValue(buildComment(`${MARKUP_CONTENT} 追記`));
    render(
      <CommentItem
        comment={buildComment(MARKUP_CONTENT)}
        isOwner={true}
        onUpdate={onUpdate}
        onDelete={jest.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '編集' }));
    const textarea = screen.getByLabelText('コメント編集');
    expect(textarea).toHaveValue(MARKUP_CONTENT);

    await user.type(textarea, ' 追記');
    await user.click(screen.getByRole('button', { name: /保存/ }));

    expect(onUpdate).toHaveBeenCalledWith('comment-1', {
      content: `${MARKUP_CONTENT} 追記`,
    });
  });
});
