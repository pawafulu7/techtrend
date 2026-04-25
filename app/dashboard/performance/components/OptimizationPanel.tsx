import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Info,
  Zap,
  Database,
  Activity,
} from 'lucide-react';
import type { OptimizationRecommendation } from '../types/dashboard';

/**
 * 最適化推奨パネル
 * パフォーマンス改善の推奨事項を表示
 */
export const OptimizationPanel: React.FC<{
  recommendations: string[] | OptimizationRecommendation[];
  className?: string;
}> = ({ recommendations, className = '' }) => {
  // 推奨事項を構造化データに変換
  const structuredRecommendations: OptimizationRecommendation[] =
    recommendations.map((rec) => {
      if (typeof rec === 'string') {
        // 文字列から推奨タイプと重要度を推測
        let type: OptimizationRecommendation['type'] = 'performance';
        let severity: OptimizationRecommendation['severity'] = 'medium';

        if (rec.includes('キャッシュ') || rec.includes('cache')) {
          type = 'cache';
        } else if (rec.includes('バッチ') || rec.includes('batch')) {
          type = 'batch';
        } else if (rec.includes('メモリ') || rec.includes('memory')) {
          type = 'memory';
        }

        if (rec.includes('警告') || rec.includes('critical')) {
          severity = 'high';
        } else if (rec.includes('注意') || rec.includes('warning')) {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        return {
          type,
          severity,
          message: rec,
          action: undefined,
        };
      }
      return rec;
    });

  // 重要度でソート
  const sortedRecommendations = [...structuredRecommendations].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // タイプアイコンの取得
  const getTypeIcon = (type: OptimizationRecommendation['type']) => {
    switch (type) {
      case 'cache':
        return <Zap className="h-4 w-4" />;
      case 'batch':
        return <Database className="h-4 w-4" />;
      case 'memory':
        return <Activity className="h-4 w-4" />;
      case 'performance':
      default:
        return <TrendingUp className="h-4 w-4" />;
    }
  };

  // 重要度バッジの取得
  const getSeverityBadge = (
    severity: OptimizationRecommendation['severity']
  ) => {
    const variants: Record<OptimizationRecommendation['severity'], string> = {
      high: 'destructive',
      medium: 'default',
      low: 'secondary',
    };

    const labels: Record<OptimizationRecommendation['severity'], string> = {
      high: '重要',
      medium: '推奨',
      low: '改善案',
    };

    return (
      <Badge variant={variants[severity] as any} className="text-xs">
        {labels[severity]}
      </Badge>
    );
  };

  if (recommendations.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5" />
            最適化推奨
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-[var(--tt-color-positive-border)] bg-[var(--tt-color-positive-bg)]">
            <CheckCircle className="h-4 w-4 text-[var(--tt-color-positive)]" />
            <AlertDescription className="text-[var(--tt-color-positive)]">
              現在、システムは最適な状態で稼働しています。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5" />
          最適化推奨
        </CardTitle>
        <CardDescription>パフォーマンス向上のための推奨事項</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedRecommendations.map((rec, index) => (
          <div
            key={index}
            className="rounded-lg border bg-[var(--tt-color-surface)] p-3 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getTypeIcon(rec.type)}</div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {getSeverityBadge(rec.severity)}
                </div>
                <p className="text-sm text-[var(--tt-color-text)]">
                  {rec.message}
                </p>
                {rec.action && (
                  <p className="mt-1 text-xs text-[var(--tt-color-text-muted)]">
                    <strong>対応策:</strong> {rec.action}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

/**
 * 最適化スコア
 * 現在の最適化状態をスコアで表示
 */
export const OptimizationScore: React.FC<{
  score: number; // 0-100
  className?: string;
}> = ({ score, className = '' }) => {
  const getScoreColor = () => {
    if (score >= 80) return 'text-[var(--tt-color-positive)]';
    if (score >= 60) return 'text-[var(--tt-color-warning)]';
    return 'text-[var(--tt-color-negative)]';
  };

  const getScoreLabel = () => {
    if (score >= 80) return '優秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '改善余地あり';
    return '要改善';
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">最適化スコア</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center">
          <div className={`text-4xl font-bold ${getScoreColor()}`}>{score}</div>
          <div className="mt-1 text-sm text-[var(--tt-color-text-muted)]">
            / 100
          </div>
          <div className={`mt-2 text-sm font-medium ${getScoreColor()}`}>
            {getScoreLabel()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * インサイトカード
 * 重要な気づきや洞察を表示
 */
export const InsightCard: React.FC<{
  title: string;
  value: string | number;
  insight: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}> = ({ title, value, insight, type = 'info' }) => {
  const typeStyles = {
    info: 'bg-[var(--tt-color-info-bg)] border-[var(--tt-color-info-border)] text-[var(--tt-color-info)]',
    success:
      'bg-[var(--tt-color-positive-bg)] border-[var(--tt-color-positive-border)] text-[var(--tt-color-positive)]',
    warning:
      'bg-[var(--tt-color-warning-bg)] border-[var(--tt-color-warning-border)] text-[var(--tt-color-warning)]',
    error:
      'bg-[var(--tt-color-negative-bg)] border-[var(--tt-color-negative-border)] text-[var(--tt-color-negative)]',
  };

  const typeIcons = {
    info: <Info className="h-4 w-4" />,
    success: <CheckCircle className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    error: <AlertTriangle className="h-4 w-4" />,
  };

  return (
    <div className={`rounded-lg border p-4 ${typeStyles[type]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{typeIcons[type]}</div>
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
          <div className="mt-2 text-sm opacity-90">{insight}</div>
        </div>
      </div>
    </div>
  );
};

export default OptimizationPanel;
