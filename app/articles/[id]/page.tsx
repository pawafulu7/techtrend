import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, TrendingUp, GraduationCap } from 'lucide-react';
import { prisma } from '@/lib/database';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import { cn } from '@/lib/utils';
import { RelatedArticles } from '@/app/components/article/related-articles';
import { ArticleTracker } from '@/app/components/analytics/ArticleTracker';
import { ViewTracker } from '@/components/article/view-tracker';
import { DetailedSummaryDisplay } from '@/app/components/article/detailed-summary-display';
import { OptimizedImage } from '@/app/components/common/optimized-image';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    from?: string;
}>;
}

async function getArticle(id: string) {
  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      source: true,
      tags: true,
    },
  });

  return article;
}

export default async function ArticlePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  
  // セキュリティ: fromパラメータの検証
  const getReturnUrl = (from: string | undefined): string => {
    if (!from) return '/';
    
    try {
      const decodedUrl = decodeURIComponent(from);
      // 相対パスまたは同一オリジンのみ許可
      if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
        return decodedUrl;
      }
      return '/';
    } catch {
      return '/';
    }
  };
  
  const returnUrl = getReturnUrl(from);
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;
  
  // Speaker Deck判定
  const isSpeakerDeck = article.source.name === 'Speaker Deck';
  
  // 短い記事（500文字以下）の判定
  const isShortArticle = article.detailedSummary === '__SKIP_DETAILED_SUMMARY__' || 
                         (article.content && article.content.length <= 500);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <ArticleTracker article={article} />
      <ViewTracker articleId={article.id} />
      <div className="mb-4">
        <Button variant="ghost" asChild>
          <Link href={returnUrl} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            記事一覧に戻る
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {isNew && (
                    <Badge className="text-xs" variant="destructive">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      New
                    </Badge>
                  )}
                  <Badge 
                    variant="secondary" 
                    className={cn("text-xs font-medium", sourceColor.tag)}
                  >
                    {article.source.name}
                  </Badge>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span>📅 配信:</span>
                      <span>{formatDateWithTime(article.publishedAt)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span>📥 取込:</span>
                      <span>{formatDateWithTime(article.createdAt)}</span>
                    </span>
                  </div>
                  {article.difficulty && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs font-medium",
                        article.difficulty === 'beginner' && "bg-green-50 text-green-700 border-green-200",
                        article.difficulty === 'intermediate' && "bg-blue-50 text-blue-700 border-blue-200",
                        article.difficulty === 'advanced' && "bg-purple-50 text-purple-700 border-purple-200"
                      )}
                    >
                      <GraduationCap className="h-3 w-3 mr-1" />
                      {article.difficulty === 'beginner' && '初級'}
                      {article.difficulty === 'intermediate' && '中級'}
                      {article.difficulty === 'advanced' && '上級'}
                    </Badge>
                  )}
                </div>

                <h1 className="text-2xl font-bold">{article.title}</h1>

                {article.tags && article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-secondary"
                        asChild
                      >
                        <Link href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}>
                          {tag.name}
                        </Link>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Speaker Deckまたは短い記事の場合はサムネイル表示、それ以外は詳細要約表示 */}
              {(isSpeakerDeck || isShortArticle) && article.thumbnail ? (
                <>
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    <OptimizedImage 
                      src={article.thumbnail} 
                      alt={article.title}
                      fill
                      priority={true}
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 66vw, 50vw"
                    />
                  </div>
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {isShortArticle && !isSpeakerDeck 
                        ? 'この記事は内容が簡潔なため、要約のみを表示しています。'
                        : 'このプレゼンテーションの詳細は元記事でご確認ください。'}
                    </p>
                  </div>
                </>
              ) : isShortArticle ? (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm font-medium">要約</p>
                  <p className="text-sm text-muted-foreground">{article.summary || '詳細は元記事でご確認ください。'}</p>
                  {article.content && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-muted-foreground">
                        ※ この記事は{article.content.length}文字の短い記事です
                      </p>
                    </div>
                  )}
                </div>
              ) : article.detailedSummary && article.detailedSummary !== '__SKIP_DETAILED_SUMMARY__' ? (
                <DetailedSummaryDisplay 
                  articleId={article.id} 
                  detailedSummary={article.detailedSummary}
                  articleType={article.articleType as "release" | "problem-solving" | "tutorial" | "tech-intro" | "implementation" | undefined}
                  summaryVersion={article.summaryVersion}
                />
              ) : article.summary ? (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">要約</p>
                  <p className="text-sm text-muted-foreground">{article.summary}</p>
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">品質スコア:</span>
                  <Badge variant="secondary">{Math.round(article.qualityScore)}</Badge>
                </div>
                
                <Button asChild>
                  <a 
                    href={article.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    元記事を読む
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <RelatedArticles articleId={article.id} />
        </div>
      </div>
    </div>
  );
}