import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import type { MetricsCardProps } from '../types/dashboard';

/**
 * メトリクスカードコンポーネント
 * 個別のメトリクスを表示するカード
 */
export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  unit,
  trend,
  trendValue,
  status,
  description
}) => {
  // トレンドアイコンの取得
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-500" />;
      default:
        return null;
    }
  };

  // ステータスインジケーターの取得
  const getStatusIndicator = () => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // ステータスに応じた色クラス
  const getStatusColorClass = () => {
    switch (status) {
      case 'good':
        return 'border-green-200 bg-green-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'critical':
        return 'border-red-200 bg-red-50';
      default:
        return '';
    }
  };

  // 値のフォーマット
  const formatValue = () => {
    if (typeof value === 'number') {
      if (unit === '%') {
        return `${value.toFixed(1)}%`;
      } else if (unit === 'ms') {
        return `${value.toFixed(1)}ms`;
      } else if (unit === 'MB') {
        return `${(value / 1024 / 1024).toFixed(1)}MB`;
      }
      return value.toLocaleString();
    }
    return value;
  };

  return (
    <Card className={`transition-all hover:shadow-md ${getStatusColorClass()}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {title}
          </CardTitle>
          {getStatusIndicator()}
        </div>
        {description && (
          <CardDescription className="text-xs">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold">
              {formatValue()}
              {unit && !['%', 'ms', 'MB'].includes(unit) && (
                <span className="text-sm font-normal text-gray-500 ml-1">
                  {unit}
                </span>
              )}
            </div>
            {trendValue && (
              <div className="flex items-center gap-1 mt-1">
                {getTrendIcon()}
                <span className={`text-xs ${
                  trend === 'up' ? 'text-green-600' :
                  trend === 'down' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * コンパクトメトリクスカード
 * スペースが限られた場所用のコンパクト版
 */
export const CompactMetricsCard: React.FC<{
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
}> = ({ label, value, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200'
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.gray}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className="text-sm font-bold">{value}</span>
      </div>
    </div>
  );
};

/**
 * メトリクスグループ
 * 関連するメトリクスをグループ化して表示
 */
export const MetricsGroup: React.FC<{
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, children, icon }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {children}
      </CardContent>
    </Card>
  );
};

export default MetricsCard;