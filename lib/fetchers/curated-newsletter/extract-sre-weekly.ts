/**
 * SRE Weekly の号の HTML から記事を取り出す。
 *
 * 記事は `.sreweekly-entry` の中の `.sreweekly-title a`（記事への直接の URL）。協賛は
 * `.sreweekly-sponsor-message` の中で、記事の枠とは別。欄が無いので、記事の並びに入った
 * ツールの紹介は除けない（編集者が記事の並びに選んだものとして受け入れる）。
 */

import * as cheerio from 'cheerio';
import { addExcluded, type ExtractionResult, type ExtractedItem } from './types';

export function extractSreWeeklyIssue(html: string): ExtractionResult {
  const $ = cheerio.load(html);
  const items: ExtractedItem[] = [];
  const excluded: Record<string, number> = {};

  $('.sreweekly-entry').each((_, entry) => {
    const $entry = $(entry);
    const anchor = $entry.find('.sreweekly-title a').first();
    const href = anchor.attr('href');
    if (!href) return;
    if ($entry.closest('.sreweekly-sponsor-message').length > 0) {
      addExcluded(excluded, 'sponsor');
      return;
    }
    items.push({ title: anchor.text().replace(/\s+/g, ' ').trim(), href, section: '' });
  });

  return { items, excluded };
}
