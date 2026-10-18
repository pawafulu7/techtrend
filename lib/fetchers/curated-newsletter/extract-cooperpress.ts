/**
 * Cooperpress 系（JavaScript Weekly・Frontend Focus・React Status・Node Weekly・Postgres Weekly）の
 * 号の HTML から、記事の欄の記事を取り出す。
 *
 * 号の HTML は、1つの記事が最も内側の <table> 1つに入る。欄の区切りはリンクの無い短い表。
 * - 見出しの記事: 段落の最初の子が <span> で、その中の <a> が `/link/<数字>/rss`
 * - 短い記事: 「📄 <a>見出し</a> – 紹介 <cite>著者</cite>」の段落
 * - 協賛: 表の中に文字が「sponsor」だけの <span> がある
 * - 短信・リリースの一覧（<li> の中）と、段落の途中のリンク（参考リンク）は記事にしない
 *
 * 記事の欄は、許す名前の一覧で決める（ユーザーが選んだのは「記事の欄だけ」。道具の欄・
 * 「And finally…」などの一回きりの欄・知らない名前の欄は除き、欄の名前ごとの数を返す）。
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { addExcluded, type ExtractionResult, type ExtractedItem } from './types';

/** 見出しの前、または誌名の見出しの下（号の最初の欄） */
export const LEAD_SECTION = 'lead';

const ARTICLE_SECTION = /article|opinion|tutorial|video|operations|performance|what['’]s new/i;
const LINK_HREF = /\/link\/\d+\/rss/;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}️‍\s]+$/u;
const SECTION_HEADER_MAX_LENGTH = 60;

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function isArticleSection(section: string): boolean {
  return section === LEAD_SECTION || ARTICLE_SECTION.test(section);
}

export function extractCooperpressIssue(html: string, newsletterName: string): ExtractionResult {
  const $ = cheerio.load(html);
  const items: ExtractedItem[] = [];
  const excluded: Record<string, number> = {};
  let section = LEAD_SECTION;

  const leaves = $('table').filter((_, table) => $(table).find('table').length === 0);
  leaves.each((_, table) => {
    const $table = $(table);
    const text = normalizeSpace($table.text());

    // 欄の見出し: リンクが無く短い表。誌名の見出しの下は、まだ最初の欄
    if ($table.find('a').length === 0) {
      if (text && text.length < SECTION_HEADER_MAX_LENGTH) {
        section = lettersOnly(text) === lettersOnly(newsletterName) ? LEAD_SECTION : text;
      }
      return;
    }

    const found = findItems($, $table);
    if (found.length === 0) return;

    const isSponsor = $table
      .find('span')
      .toArray()
      .some((span) => normalizeSpace($(span).text()).toLowerCase() === 'sponsor');

    for (const item of found) {
      if (isSponsor) {
        addExcluded(excluded, 'sponsor');
      } else if (!isArticleSection(section)) {
        addExcluded(excluded, `section:${section}`);
      } else {
        items.push({ ...item, section });
      }
    }
  });

  return { items, excluded };
}

function findItems($: cheerio.CheerioAPI, $table: cheerio.Cheerio<Element>): Omit<ExtractedItem, 'section'>[] {
  const found: Omit<ExtractedItem, 'section'>[] = [];
  $table.find('p').each((_, p) => {
    const $p = $(p);
    if ($p.closest('li').length > 0) return;

    // 見出しの記事: 段落の最初の子が <span> で、その中の最初の <a> が記事のリンク
    const firstElement = $p.children().first();
    if (firstElement.is('span')) {
      const anchor = firstElement.children('a').first();
      const href = anchor.attr('href') ?? '';
      if (anchor.length > 0 && LINK_HREF.test(href)) {
        found.push({ title: normalizeSpace(anchor.text()), href });
        return;
      }
    }

    // 短い記事: 先頭の文字が絵文字だけで、すぐ後に記事のリンクが来て、著者（<cite>）を含む段落
    const firstNode = $p.contents().first();
    const leadText = firstNode.length > 0 && firstNode[0].type === 'text' ? firstNode.text() : '';
    const nextNode = firstNode.next();
    const href = nextNode.attr('href') ?? '';
    if (
      leadText.trim() !== '' &&
      EMOJI_ONLY.test(leadText) &&
      nextNode.is('a') &&
      LINK_HREF.test(href) &&
      $p.children('cite').length > 0
    ) {
      found.push({ title: normalizeSpace(nextNode.text()), href });
    }
  });
  return found;
}
