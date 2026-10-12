/**
 * 日本語の記事に付いた翻訳タイトル（translatedTitle）を消す（issue #725）
 *
 * 翻訳タイトルはタイトルの文字だけで判定して作っていたため、英語のタイトルを付けた日本語の
 * 記事（Zenn など）にも付き、画面に「英語から自動翻訳」と出ていた。いまの判定
 * （gemini-title-translator.ts）で訳さない記事、つまりタイトルか本文が日本語の記事から消す。
 * 消した記事は原題のまま表示され、翻訳のバッジも出なくなる。
 *
 * 既定は件数を出すだけで、更新しない。--apply で更新する。--show で対象のタイトルを標準エラーに出す。
 *   npx tsx scripts/maintenance/clear-japanese-translated-titles.ts [--apply] [--show]
 * 本番 DB は scripts/db/with-prod-db.sh 経由で流す（件数の行だけが表示される）:
 *   bash scripts/db/with-prod-db.sh --as-database-url npx tsx scripts/maintenance/clear-japanese-translated-titles.ts
 *
 * Redis のキャッシュは消さない。記事一覧・詳細は 1 時間以内、人気記事は最長 24 時間で切れる。
 */
import { createPrismaClient } from '@/lib/prisma/create-client';
import {
  isLikelyJapanese,
  isLikelyJapaneseBody,
} from '@/lib/utils/language-detection';

const prisma = createPrismaClient();

type Candidate = { id: string; title: string; body: string | null };

async function main() {
  const apply = process.argv.includes('--apply');
  const show = process.argv.includes('--show');

  // かなも漢字も無い記事は判定するまでもなく対象外なので、SQL で先に絞る（本文を全件読まない）。
  // タイトルの範囲は isLikelyJapanese（和文の記号 U+3000-303F を含む）と合わせる
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT id, title, left(content, 3000) AS body
    FROM "Article"
    WHERE "translatedTitle" IS NOT NULL
      AND (title ~ '[\u3000-\u30FF\u4E00-\u9FFF]' OR left(content, 3000) ~ '[\u3040-\u309F]')
  `;

  const japaneseTitle = candidates.filter((a) => isLikelyJapanese(a.title));
  const japaneseBody = candidates.filter(
    (a) => !isLikelyJapanese(a.title) && isLikelyJapaneseBody(a.body)
  );
  const targets = [...japaneseTitle, ...japaneseBody];

  console.log(`candidates=${candidates.length}`);
  console.log(`japanese_title=${japaneseTitle.length}`);
  console.log(`japanese_body=${japaneseBody.length}`);
  console.log(`targets=${targets.length}`);

  if (show) {
    for (const a of targets) {
      console.error(`${a.id}\t${a.title.slice(0, 60)}`);
    }
  }

  if (!apply) {
    console.error(
      '件数だけを出しました。更新するときは --apply を付けてください'
    );
    return;
  }

  const result = await prisma.article.updateMany({
    where: {
      id: { in: targets.map((a) => a.id) },
      translatedTitle: { not: null },
    },
    data: { translatedTitle: null },
  });
  console.log(`updated=${result.count}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
