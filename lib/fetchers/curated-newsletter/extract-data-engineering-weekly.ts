/**
 * Data Engineering Weekly の号の HTML から記事を取り出す。
 *
 * 号は <hr> で区切った節で、各節は <h1> の見出し・紹介の段落・記事の URL だけを書いた段落の順。
 * 協賛は見出しが「Sponsored:」「Event Alert:」で始まるか、URL だけの段落が無い。見出しが
 * 「Editor’s Note:」の節はイベントやポッドキャストの案内なので記事にしない。
 * 号でない投稿（著者のエッセイ）は、index.ts が投稿そのものを1本の記事にする。
 */

import * as cheerio from 'cheerio';
import { addExcluded, type ExtractionResult, type ExtractedItem } from './types';

/** フィードの投稿のうち、号（記事の一覧）であるもの */
export const ISSUE_TITLE = /^Data Engineering Weekly #\d+/;

/** 号とみなす記事の節の数（エッセイが URL だけの段落を偶然持っても、号と取り違えないため） */
const MIN_ISSUE_ITEMS = 3;

/** タイトルが号の形でなくても、記事の節が並んでいれば号とみなす */
export function looksLikeDataEngineeringWeeklyIssue(html: string): boolean {
  return extractDataEngineeringWeeklyIssue(html).items.length >= MIN_ISSUE_ITEMS;
}

const NOT_ARTICLE_HEADING = /^(sponsored|event alert|editor['’]s note)\b/i;

export function extractDataEngineeringWeeklyIssue(html: string): ExtractionResult {
  const $ = cheerio.load(html);
  const items: ExtractedItem[] = [];
  const excluded: Record<string, number> = {};
  let heading: string | null = null;

  $('h1, p, hr').each((_, element) => {
    const $element = $(element);
    if (element.tagName === 'hr') {
      heading = null;
      return;
    }
    if (element.tagName === 'h1') {
      heading = $element.text().replace(/\s+/g, ' ').trim();
      return;
    }
    if (heading === null) return;

    // URL だけを書いた段落が、その節の記事のリンク
    const text = $element.text().trim();
    const anchor = $element.find('a').first();
    const href = anchor.attr('href');
    if (!href || !/^https?:\/\//.test(text) || text !== anchor.text().trim()) return;

    if (NOT_ARTICLE_HEADING.test(heading)) {
      addExcluded(excluded, 'notice');
    } else {
      items.push({ title: heading, href, section: '' });
    }
    heading = null;
  });

  return { items, excluded };
}
