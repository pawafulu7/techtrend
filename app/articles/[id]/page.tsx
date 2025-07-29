import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Calendar, TrendingUp, ThumbsUp, GraduationCap } from 'lucide-react';
import { prisma } from '@/lib/database';
import { formatDate } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import { cn } from '@/lib/utils';
import { RelatedArticles } from '@/app/components/article/related-articles';

interface PageProps {
  params: Promise<{
    id: string;
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

export default async function ArticlePage({ params }: PageProps) {
  const { id } = await params;
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-4">
        <Button variant="ghost" asChild>
          <Link href="/" className="flex items-center gap-2">
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
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {hoursAgo < 1 ? 'たった今' : 
                     hoursAgo < 24 ? `${hoursAgo}時間前` : 
                     formatDate(article.publishedAt)}
                  </span>
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
                        <Link href={`/?tag=${encodeURIComponent(tag.name)}`}>
                          {tag.name}
                        </Link>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {article.summary && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">要約</p>
                  <p className="text-sm text-muted-foreground">{article.summary}</p>
                </div>
              )}

              {article.content && (
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm font-medium mb-2">記事内容</p>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {article.content}
                  </div>
                </div>
              )}

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