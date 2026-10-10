import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { ListItem, Root, Text } from 'mdast';
import type { Data } from 'unist';
import type { Properties } from 'hast';

const ARTICLE_ID_PATTERN = /\[#([a-zA-Z0-9_-]+)\]/;
// 行頭の目印は後ろの空白ごと、それ以外は前の空白 1 つごと消す（改行は残す）。
// 目印だけを消して前後の空白を詰めると、`**bold** [#id] text` のように要素の境目で文字がくっつく
const LEADING_ARTICLE_ID_PATTERN = /(^|\n)\[#[a-zA-Z0-9_-]+\][ \t]*/g;
const ARTICLE_ID_PATTERN_GLOBAL = /[ \t]?\[#[a-zA-Z0-9_-]+\]/g;

/** 記事 ID の目印（`[#id]`）を消す。描いた文字・コピー・書式なしの表示で同じ結果にする */
export function stripArticleIdTokens(text: string): string {
  return text
    .replace(LEADING_ARTICLE_ID_PATTERN, '$1')
    .replace(ARTICLE_ID_PATTERN_GLOBAL, '');
}

type ListItemData = Data & {
  hProperties?: Properties;
};

const remarkExtractArticleId: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'listItem', (listItem: ListItem) => {
    let articleId: string | undefined;

    visit(listItem, 'text', (textNode: Text) => {
      const match = textNode.value.match(ARTICLE_ID_PATTERN);
      if (match) {
        articleId ??= match[1];
      }
    });

    if (!articleId) {
      return;
    }

    const data = ((listItem.data as ListItemData | undefined) ??
      {}) as ListItemData;
    const hProperties = (data.hProperties ??= {});
    hProperties['data-article-id'] = articleId;
    listItem.data = data;
  });

  // 目印は箇条書きの外（見出しなど）にも出ることがあるので、どこにあっても消す。
  // 書式なしの表示とコピー（stripArticleIdTokens）と同じ範囲にする
  visit(tree, 'text', (textNode: Text) => {
    if (!ARTICLE_ID_PATTERN.test(textNode.value)) {
      return;
    }
    textNode.value = stripArticleIdTokens(textNode.value);
  });
};

export default remarkExtractArticleId;
