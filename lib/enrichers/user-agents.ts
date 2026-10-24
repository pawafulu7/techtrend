/**
 * 記事ページの取得で名乗る User-Agent。
 *
 * generic.ts から分けているのは、テストが './generic' を mock すると、そこから import した定数が
 * undefined になり、User-Agent を付けずに要求を送るため。
 */

/** 記事ページの取得で最初に名乗る User-Agent */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * ボットとして名乗る User-Agent。ブラウザを名乗る要求には JavaScript の確認ページ
 * （"Checking your browser..."）を 403 で返し、ボットを名乗れば記事を返すホスティングがある
 * （WordPress 系の個人ブログなど）。逆に medium.com はボットに Cloudflare の確認ページ（403）を返す
 */
export const BOT_USER_AGENT =
  'Mozilla/5.0 (compatible; TechTrendBot/1.0; +https://techtrend.example.com/bot)';
