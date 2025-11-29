import { PopularArticles } from '@/app/components/popular/PopularArticles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Info, Clock } from 'lucide-react';

export default function PopularPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <TrendingUp className="h-8 w-8" />
          Popular Articles Ranking
        </h1>
        <p className="text-muted-foreground">
          Discover the most read articles by our readers
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
                About Rankings
              </CardTitle>
              <Badge variant="secondary" className="w-fit mt-2">
                <Clock className="h-3 w-3 mr-1" />
                Updated hourly
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-base font-medium mb-2">Combined Ranking</h3>
                <p className="text-sm text-muted-foreground">
                  A comprehensive ranking that evaluates bookmark count, votes, quality score, and recency.
                </p>
              </div>

              <div>
                <h3 className="text-base font-medium mb-2">Saved</h3>
                <p className="text-sm text-muted-foreground">
                  Ranking based on reader saves. Articles that are referenced long-term rank higher.
                </p>
              </div>

              <div>
                <h3 className="text-base font-medium mb-2">Votes</h3>
                <p className="text-sm text-muted-foreground">
                  Ranking based on reader votes. Directly reflects article usefulness.
                </p>
              </div>

              <div>
                <h3 className="text-base font-medium mb-2">Quality Score</h3>
                <p className="text-sm text-muted-foreground">
                  A comprehensive score evaluating article content, structure, and technical depth.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Time Periods</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Today:</span> Past 24 hours
              </p>
              <p>
                <span className="font-medium text-foreground">Week:</span> Past 7 days
              </p>
              <p>
                <span className="font-medium text-foreground">Month:</span> Past 30 days
              </p>
              <p>
                <span className="font-medium text-foreground">All Time:</span> All periods
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
