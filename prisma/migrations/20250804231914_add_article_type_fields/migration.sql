-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT,
    "thumbnail" TEXT,
    "content" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "sourceId" TEXT NOT NULL,
    "bookmarks" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" REAL NOT NULL DEFAULT 0,
    "userVotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "difficulty" TEXT,
    "detailedSummary" TEXT,
    "articleType" TEXT,
    "summaryVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Article" ("bookmarks", "content", "createdAt", "detailedSummary", "difficulty", "id", "publishedAt", "qualityScore", "sourceId", "summary", "thumbnail", "title", "updatedAt", "url", "userVotes") SELECT "bookmarks", "content", "createdAt", "detailedSummary", "difficulty", "id", "publishedAt", "qualityScore", "sourceId", "summary", "thumbnail", "title", "updatedAt", "url", "userVotes" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
CREATE UNIQUE INDEX "Article_url_key" ON "Article"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
