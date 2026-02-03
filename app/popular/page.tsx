import { PopularArticles } from '@/app/components/popular/PopularArticles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Info, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';

export default function PopularPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        icon={TrendingUp}
        title="人気記事ランキング"
        description="読者に最も読まれている記事をチェック"
        className="mb-8"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PopularArticles limit={20} />
        </div>

        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                ランキングについて
              </CardTitle>
              <Badge variant="secondary" className="mt-2 w-fit">
                <Clock className="mr-1 h-3 w-3" />
                毎時更新
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="mb-2 text-base font-medium">総合ランキング</h3>
                <p className="text-muted-foreground text-sm">
                  ブックマーク数、投票数、品質スコア、新しさを総合的に評価したランキングです。
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-base font-medium">ブックマーク</h3>
                <p className="text-muted-foreground text-sm">
                  読者が保存した回数に基づくランキング。長期的に参照される記事が上位に来ます。
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-base font-medium">投票</h3>
                <p className="text-muted-foreground text-sm">
                  読者の評価投票に基づくランキング。記事の有用性を直接反映します。
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-base font-medium">品質スコア</h3>
                <p className="text-muted-foreground text-sm">
                  記事の内容、構成、技術的深さを総合的に評価したスコアです。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>期間について</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <p>
                <span className="text-foreground font-medium">今日:</span>{' '}
                過去24時間
              </p>
              <p>
                <span className="text-foreground font-medium">週間:</span>{' '}
                過去7日間
              </p>
              <p>
                <span className="text-foreground font-medium">月間:</span>{' '}
                過去30日間
              </p>
              <p>
                <span className="text-foreground font-medium">全期間:</span>{' '}
                すべての期間
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
