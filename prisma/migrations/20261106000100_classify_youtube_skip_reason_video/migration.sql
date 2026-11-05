-- 取得失敗（CONTENT_FETCH_FAILED）のうち、本文の無い YouTube の動画の記事を VIDEO に付け替える。
-- 判定は lib/utils/url/youtube.ts の isYouTubeVideoUrl と同じ（ホストは youtube.com・www・m・youtu.be、
-- video ID は11文字）。要約の処理が新しく付ける条件（本文が無い）にもそろえる
UPDATE "Article"
SET "skipReason" = 'VIDEO'
WHERE "skipReason" = 'CONTENT_FETCH_FAILED'
  AND COALESCE("contentLength", 0) = 0
  AND (
    "url" ~* '^https?://((www|m)\.)?youtube\.com/watch\?([^#]*&)?v=[a-z0-9_-]{11}(&|#|$)'
    OR "url" ~* '^https?://((www|m)\.)?youtube\.com/(embed|shorts|live)/[a-z0-9_-]{11}([^a-z0-9_-]|$)'
    OR "url" ~* '^https?://youtu\.be/[a-z0-9_-]{11}([/?#]|$)'
  );
