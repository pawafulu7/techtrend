import { PopularArticles } from '@/app/components/popular/PopularArticles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Info } from 'lucide-react';

export default function PopularPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <TrendingUp className="h-8 w-8" />
          人気記事ランキング
        </h1>
        <p className="text-muted-foreground">
          読者に最も読まれている記事をチェック
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PopularArticles limit={20} />
        </div>
        
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                ランキングについて
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">総合ランキング</h3>
                <p className="text-sm text-muted-foreground">
                  ブックマーク数、投票数、品質スコア、新しさを総合的に評価したランキングです。
                </p>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">ブックマーク</h3>
                <p className="text-sm text-muted-foreground">
                  読者が保存した回数に基づくランキング。長期的に参照される記事が上位に来ます。
                </p>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">投票</h3>
                <p className="text-sm text-muted-foreground">
                  読者の評価投票に基づくランキング。記事の有用性を直接反映します。
                </p>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">品質スコア</h3>
                <p className="text-sm text-muted-foreground">
                  記事の内容、構成、技術的深さを総合的に評価したスコアです。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>期間について</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">今日:</span> 過去24時間
              </p>
              <p>
                <span className="font-medium text-foreground">週間:</span> 過去7日間
              </p>
              <p>
                <span className="font-medium text-foreground">月間:</span> 過去30日間
              </p>
              <p>
                <span className="font-medium text-foreground">全期間:</span> すべての期間
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}