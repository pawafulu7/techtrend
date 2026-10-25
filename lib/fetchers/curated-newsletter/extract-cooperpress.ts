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
 *
 * 最初の欄は特集の見出し（例: React Status #494 の「TanStack Start Reaches 1.0」）で始まることがある。
 * 見出しは欄の見出しと同じ「リンクの無い短い表」で HTML では区別できないので、位置で区別する
 * （isLeadHeadline）。区別しないと最初の欄の記事がすべて知らない名前の欄として除かれ、号から記事を
 * 1本も取り出せずに収集のジョブが失敗する（2026-10-25 の Scheduler - Scraping Twice Daily）。
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import {
  addExcluded,
  type ExtractionResult,
  type ExtractedItem,
} from './types';

/** 見出しの前、または誌名の見出しの下（号の最初の欄） */
export const LEAD_SECTION = 'lead';

const ARTICLE_SECTION =
  /article|opinion|tutorial|video|operations|performance|what['’]s new/i;
const LINK_HREF = /\/link\/\d+\/rss/;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}️‍\s]+$/u;
const SECTION_HEADER_MAX_LENGTH = 60;

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// 記事の欄でないと分かっている欄（道具・リリース・求人・号の最後のおまけ）。これ以外の名前の欄を除くときは WARN を出す
const KNOWN_EXCLUDED_SECTION =
  /code|tools|releases|libraries|resources|classified|and finally|elsewhere/i;

export function isKnownExcludedSection(section: string): boolean {
  return KNOWN_EXCLUDED_SECTION.test(section);
}

/**
 * 記事の欄でない欄の見出しの実物（先頭の絵文字と末尾の記号を落とし、小文字にしたもの）。
 * 号の先頭にこれと完全に一致する見出しがあれば、特集の見出しではなく欄として扱う。
 * 部分一致（KNOWN_EXCLUDED_SECTION）にすると「Code」「Tools」を含む特集の見出しを取り違えるので、
 * ここだけは完全一致で見る。号の最後の「And finally…」は文言が号ごとに変わるが、先頭には来ないので載せない
 */
const EXACT_EXCLUDED_SECTIONS: ReadonlySet<string> = new Set([
  'code & tools', // JavaScript Weekly・Node Weekly
  'code, tools & libraries', // React Status
  'tools, code & resources', // Frontend Focus
  'releases and code', // Postgres Weekly（「RELEASES AND CODE:」）
  'classifieds',
  'elsewhere in the ecosystem',
]);

function normalizeSectionName(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isExactExcludedSection(text: string): boolean {
  return EXACT_EXCLUDED_SECTIONS.has(normalizeSectionName(text));
}

export function isArticleSection(section: string): boolean {
  return section === LEAD_SECTION || ARTICLE_SECTION.test(section);
}

/**
 * 最初の欄の特集の見出しか（例: React Status #494 の「TanStack Start Reaches 1.0」、
 * Frontend Focus #763 の「Everyone's Interop 2027 Wishlists」）。
 *
 * 最初の欄で、まだ記事を1本も取っておらず、記事の欄の名前でも、記事でない欄の見出しの実物
 * （EXACT_EXCLUDED_SECTIONS）でもないものは、特集の見出しとみなして欄を変えない。
 * Cooperpress の号は最初の欄に記事がある形なので、最初の欄に記事が無いまま道具の欄が来ることは
 * 想定しないが、形が変わって来たときは道具の記事を黙って保存せず、記事0本の失敗（SourceFormatError）で
 * 人が気づけるようにする。記事を取った後に出る知らない名前は、一回きりの欄
 * （例: 「🔤 A font that annotates itself」）として今までどおり除く。
 */
function isLeadHeadline(
  text: string,
  section: string,
  itemCount: number
): boolean {
  return (
    section === LEAD_SECTION &&
    itemCount === 0 &&
    !isArticleSection(text) &&
    !isExactExcludedSection(text)
  );
}

export function extractCooperpressIssue(
  html: string,
  newsletterName: string
): ExtractionResult {
  const $ = cheerio.load(html);
  const items: ExtractedItem[] = [];
  const excluded: Record<string, number> = {};
  let section = LEAD_SECTION;

  const leaves = $('table').filter(
    (_, table) => $(table).find('table').length === 0
  );
  leaves.each((_, table) => {
    const $table = $(table);
    const text = normalizeSpace($table.text());

    // 欄の見出し: リンクが無く短い表。誌名の見出しの下は、まだ最初の欄。特集の見出しは欄を変えない
    if ($table.find('a').length === 0) {
      if (!text || text.length >= SECTION_HEADER_MAX_LENGTH) return;
      if (lettersOnly(text) === lettersOnly(newsletterName)) {
        section = LEAD_SECTION;
      } else if (!isLeadHeadline(text, section, items.length)) {
        section = text;
      }
      return;
    }

    const found = findItems($, $table);
    if (found.length === 0) return;

    const isSponsor = $table
      .find('span')
      .toArray()
      .some(
        (span) => normalizeSpace($(span).text()).toLowerCase() === 'sponsor'
      );

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

function findItems(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>
): Omit<ExtractedItem, 'section'>[] {
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
    const leadText =
      firstNode.length > 0 && firstNode[0].type === 'text'
        ? firstNode.text()
        : '';
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
