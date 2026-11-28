import type { CheerioAPI } from 'cheerio';

/**
 * Speaker Deck の発表ページから本文を作る。タイトル・説明文・スライドごとの文字（Transcript 欄の
 * .slide-transcript）を空行で区切って並べる。文字のあるスライドが1枚も無い資料（画像だけの PDF など）は null。
 *
 * 発表ページの説明文は多くが 100 文字に届かず、それだけでは要約の対象から外れる（THIN_CONTENT）。
 * 収集（lib/fetchers/speakerdeck.ts）と保存後の取り直し（lib/enrichers/speakerdeck.ts）で同じ本文にするため、
 * ここだけで組み立てる
 */
export function extractSpeakerDeckTranscript($: CheerioAPI): string | null {
  const slides = $('.slide-transcript')
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((text) => text.length > 0);
  if (slides.length === 0) return null;

  const description = normalizeWhitespace(
    $('.deck-description').first().text() ||
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      ''
  );
  return [speakerDeckTitle($), description, ...slides]
    .filter((part) => part.length > 0)
    .join('\n\n');
}

/** og:title かページの title（末尾の " - Speaker Deck" を除く） */
export function speakerDeckTitle($: CheerioAPI): string {
  const title =
    $('meta[property="og:title"]').attr('content') || $('title').text();
  return title.replace(' - Speaker Deck', '').trim();
}

/** 連続する空白・改行を1つの空白にまとめる */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
