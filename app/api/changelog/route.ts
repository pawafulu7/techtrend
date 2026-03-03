import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisCache } from '@/lib/cache';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';
import { handleApiError } from '@/lib/api/error-handler';

const NOT_FOUND_SENTINEL = { notFound: true as const };

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

async function handler(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // パラメータバリデーション（キャッシュキー爆発防止）
    const projectSlug = searchParams.get('project') || 'claude-code';
    if (!/^[a-z0-9-]{1,50}$/.test(projectSlug)) {
      return NextResponse.json(
        { error: 'Invalid project parameter' },
        { status: 400 }
      );
    }

    const versionParam = searchParams.get('version') || null;
    if (
      versionParam &&
      !/^v?\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?$/.test(versionParam)
    ) {
      return NextResponse.json(
        { error: 'Invalid version parameter' },
        { status: 400 }
      );
    }
    if (versionParam && versionParam.length > 30) {
      return NextResponse.json(
        { error: 'Invalid version parameter' },
        { status: 400 }
      );
    }

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
        return NOT_FOUND_SENTINEL;
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

      // エントリを取得（targetVersion未検出でも空配列/空オブジェクトを返す）
      let entries: Array<{
        id: string;
        content: string;
        titleJa: string | null;
        contentJa: string | null;
        category: string;
        orderIndex: number;
      }> = [];
      const categoryCounts: Record<string, number> = {
        FEATURE: 0,
        BUGFIX: 0,
        IMPROVEMENT: 0,
        OTHER: 0,
      };

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

    // プロジェクト未検出（sentinel値によるキャッシュ対応）
    if (result && 'notFound' in result) {
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

export const GET = withRateLimit('read:changelog', handler);
