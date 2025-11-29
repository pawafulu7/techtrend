import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

/**
 * MetricsCard Props
 * Shared across Performance Dashboard and Job Management Dashboard
 */
export interface MetricsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  status?: 'good' | 'warning' | 'critical';
  description?: string;
  isIncreaseGood?: boolean;
  className?: string;
}

/**
 * MetricsCard Component
 * Displays individual metrics with optional trend and status indicators
 */
export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  unit,
  trend,
  trendValue,
  status,
  description,
  isIncreaseGood = true,
  className = '',
}) => {
  /**
   * Get text color class for trend indicator
   */
  const getTrendColor = () => {
    if (trend === 'up') return isIncreaseGood ? 'text-green-500' : 'text-red-500';
    if (trend === 'down')
      return isIncreaseGood ? 'text-red-500' : 'text-green-500';
    return 'text-gray-500';
  };

  /**
   * Get darker text color for trend value text (600 shade)
   * Uses explicit mapping instead of fragile string replacement
   */
  const getTrendTextColor = () => {
    if (trend === 'up') return isIncreaseGood ? 'text-green-600' : 'text-red-600';
    if (trend === 'down')
      return isIncreaseGood ? 'text-red-600' : 'text-green-600';
    return 'text-gray-600';
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className={`h-4 w-4 ${getTrendColor()}`} />;
      case 'down':
        return <TrendingDown className={`h-4 w-4 ${getTrendColor()}`} />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusIndicator = () => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColorClass = () => {
    switch (status) {
      case 'good':
        return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
      case 'warning':
        return 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950';
      case 'critical':
        return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
      default:
        return '';
    }
  };

  /**
   * Format the display value based on unit type
   * - '%': Format as percentage with 1 decimal place
   * - 'ms': Format as milliseconds with 1 decimal place
   * - 'MB': Convert from bytes to megabytes (value expected in bytes)
   * - other: Use locale-formatted number
   */
  const formatValue = () => {
    if (typeof value === 'number') {
      if (unit === '%') {
        return `${value.toFixed(1)}%`;
      } else if (unit === 'ms') {
        return `${value.toFixed(1)}ms`;
      } else if (unit === 'MB') {
        // Note: value is expected to be in bytes; converts to MB
        return `${(value / 1024 / 1024).toFixed(1)}MB`;
      }
      return value.toLocaleString();
    }
    return value;
  };

  return (
    <Card
      className={`transition-all hover:shadow-md min-h-[120px] ${getStatusColorClass()} ${className}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {getStatusIndicator()}
        </div>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold tabular-nums">
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
                <span className={`text-xs ${getTrendTextColor()}`}>
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
 * CompactMetricsCard Props
 */
export interface CompactMetricsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'gray';
}

/**
 * CompactMetricsCard Component
 * A compact version for limited space
 */
export const CompactMetricsCard: React.FC<CompactMetricsCardProps> = ({
  label,
  value,
  icon,
  color = 'blue',
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    green:
      'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    yellow:
      'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
    orange:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    gray: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800',
  };

  return (
    <div
      className={`rounded-lg border p-3 ${colorClasses[color] || colorClasses.gray}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className="text-sm font-bold tabular-nums">{value}</span>
      </div>
    </div>
  );
};

/**
 * MetricsGroup Props
 */
export interface MetricsGroupProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * MetricsGroup Component
 * Groups related metrics together
 */
export const MetricsGroup: React.FC<MetricsGroupProps> = ({
  title,
  children,
  icon,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">{children}</CardContent>
    </Card>
  );
};

export default MetricsCard;
