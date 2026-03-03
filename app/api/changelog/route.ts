import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';
import { handleApiError } from '@/lib/api/error-handler';

// Changelog用キャッシュを遅延初期化
let changelogCache: RedisCache | null = null;

const getChangelogCache = () => {
  if (!changelogCache) {
    changelogCache = new RedisCache({
      ttl: 3600, // 1時間
      namespace: '@techtrend/cache:changelog',
    });
  }
  return changelogCache;
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const projectSlug = searchParams.get('project') || 'claude-code';
    const versionParam = searchParams.get('version') || null;

    // キャッシュキーを生成
    const cache = getChangelogCache();
    const cacheKey = cache.generateCacheKey('changelog', {
      params: { project: projectSlug, version: versionParam || 'latest' },
    });

    // キャッシュから取得
    const result = await cache.getOrSet(cacheKey, async () => {
      // プロジェクトを取得
      const project = await prisma.changelogProject.findUnique({
        where: { slug: projectSlug, enabled: true },
        select: {
          id: true,
          slug: true,
          name: true,
          sourceUrl: true,
          iconUrl: true,
        },
      });

      if (!project) {
        return null;
      }

      // 全バージョンを取得（sortOrder降順）
      const versions = await prisma.changelogVersion.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          version: true,
          sortOrder: true,
          createdAt: true,
          _count: {
            select: { entries: true },
          },
        },
        orderBy: { sortOrder: 'desc' },
      });

      // バージョンレスポンスを整形
      const formattedVersions = versions.map((v) => ({
        id: v.id,
        version: v.version,
        sortOrder: v.sortOrder,
        createdAt: v.createdAt,
        entryCount: v._count.entries,
      }));

      // 対象バージョンを決定
      let targetVersion: (typeof versions)[number] | undefined;
      if (versionParam) {
        targetVersion = versions.find((v) => v.version === versionParam);
      } else {
        // 最新バージョン（sortOrder最大）
        targetVersion = versions[0];
      }

      // エントリを取得
      let entries: Array<{
        id: string;
        content: string;
        titleJa: string | null;
        contentJa: string | null;
        category: string;
        orderIndex: number;
      }> | null = null;
      let categoryCounts: Record<string, number> | null = null;

      if (targetVersion) {
        const versionEntries = await prisma.changelogEntry.findMany({
          where: { versionId: targetVersion.id },
          select: {
            id: true,
            content: true,
            titleJa: true,
            contentJa: true,
            category: true,
            orderIndex: true,
          },
          orderBy: { orderIndex: 'asc' },
        });

        entries = versionEntries;

        // カテゴリ別カウント
        categoryCounts = {
          FEATURE: 0,
          BUGFIX: 0,
          IMPROVEMENT: 0,
          OTHER: 0,
        };
        for (const entry of versionEntries) {
          categoryCounts[entry.category] =
            (categoryCounts[entry.category] || 0) + 1;
        }
      }

      return {
        project,
        versions: formattedVersions,
        entries,
        categoryCounts,
      };
    });

    // プロジェクト未検出
    if (result === null) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      { error, route: '/api/changelog' },
      'API error in /api/changelog'
    );
    return handleApiError(error, '/api/changelog');
  }
}
