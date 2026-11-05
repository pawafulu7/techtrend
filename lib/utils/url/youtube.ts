/**
 * YouTube の動画の URL の判定。
 *
 * サムネイルを作る YouTubeEnricher と、本文の無い動画の記事を取得失敗と分ける要約の処理
 * （lib/summary/pending-articles.ts）で同じ判定を使う。
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

/** YouTube の video ID は英数字・ハイフン・アンダースコアの11文字 */
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function validVideoId(videoId: string | null | undefined): string | null {
  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

/**
 * YouTube の動画の URL から video ID を取り出す。動画でない URL（チャンネル・プレイリストだけの
 * URL、YouTube 以外のホスト）は null。
 *
 * 対応する形:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) return null;

  if (hostname === 'youtu.be') {
    return validVideoId(parsed.pathname.slice(1).split('/')[0]);
  }

  const vParam = parsed.searchParams.get('v');
  if (vParam) return validVideoId(vParam);

  const pathMatch = parsed.pathname.match(
    /^\/(embed|shorts|live)\/([a-zA-Z0-9_-]+)/
  );
  return pathMatch ? validVideoId(pathMatch[2]) : null;
}

/** YouTube の動画の URL か */
export function isYouTubeVideoUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}
