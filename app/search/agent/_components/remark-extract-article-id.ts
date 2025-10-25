import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { ListItem, Root, Text } from 'mdast';
import type { Data } from 'unist';
import type { Properties } from 'hast';

const ARTICLE_ID_PATTERN = /\[#([a-zA-Z0-9_-]+)\]/;
const ARTICLE_ID_PATTERN_GLOBAL = /\[#([a-zA-Z0-9_-]+)\]/g;

type ListItemData = Data & {
  hProperties?: Properties;
};

const remarkExtractArticleId: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'listItem', (listItem: ListItem) => {
    let articleId: string | undefined;

    visit(listItem, 'text', (textNode: Text) => {
      const match = textNode.value.match(ARTICLE_ID_PATTERN);
      if (!match) {
        return;
      }

      articleId ??= match[1];

      const cleanedValue = textNode.value.replace(ARTICLE_ID_PATTERN_GLOBAL, '');
      textNode.value = cleanedValue.replace(/^\s+/, '');
    });

    if (!articleId) {
      return;
    }

    const data = ((listItem.data as ListItemData | undefined) ?? {}) as ListItemData;
    const hProperties = (data.hProperties ??= {});
    hProperties['data-article-id'] = articleId;
    listItem.data = data;
  });
};

export default remarkExtractArticleId;
