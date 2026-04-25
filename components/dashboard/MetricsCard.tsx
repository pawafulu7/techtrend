import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
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
    if (trend === 'up')
      return isIncreaseGood
        ? 'text-[var(--tt-color-positive)]'
        : 'text-[var(--tt-color-negative)]';
    if (trend === 'down')
      return isIncreaseGood
        ? 'text-[var(--tt-color-negative)]'
        : 'text-[var(--tt-color-positive)]';
    return 'text-[var(--tt-color-text-muted)]';
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className={`h-4 w-4 ${getTrendColor()}`} />;
      case 'down':
        return <TrendingDown className={`h-4 w-4 ${getTrendColor()}`} />;
      case 'stable':
        return <Minus className="h-4 w-4 text-[var(--tt-color-text-muted)]" />;
      default:
        return null;
    }
  };

  const getStatusIndicator = () => {
    switch (status) {
      case 'good':
        return (
          <CheckCircle className="h-4 w-4 text-[var(--tt-color-positive)]" />
        );
      case 'warning':
        return (
          <AlertTriangle className="h-4 w-4 text-[var(--tt-color-warning)]" />
        );
      case 'critical':
        return <XCircle className="h-4 w-4 text-[var(--tt-color-negative)]" />;
      default:
        return null;
    }
  };

  const getStatusColorClass = () => {
    switch (status) {
      case 'good':
        return 'border-[var(--tt-color-positive-border)] bg-[var(--tt-color-positive-bg)]';
      case 'warning':
        return 'border-[var(--tt-color-warning-border)] bg-[var(--tt-color-warning-bg)]';
      case 'critical':
        return 'border-[var(--tt-color-negative-border)] bg-[var(--tt-color-negative-bg)]';
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
      className={`min-h-[120px] transition-all hover:shadow-md ${getStatusColorClass()} ${className}`}
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
                <span className="ml-1 text-sm font-normal text-[var(--tt-color-text-muted)]">
                  {unit}
                </span>
              )}
            </div>
            {trendValue && (
              <div className="mt-1 flex items-center gap-1">
                {getTrendIcon()}
                <span className={`text-xs ${getTrendColor()}`}>
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
  color?: 'blue' | 'green' | 'warning' | 'red' | 'gray';
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
    blue: 'bg-[var(--tt-color-info-bg)] text-[var(--tt-color-info)] border-[var(--tt-color-info-border)]',
    green:
      'bg-[var(--tt-color-positive-bg)] text-[var(--tt-color-positive)] border-[var(--tt-color-positive-border)]',
    warning:
      'bg-[var(--tt-color-warning-bg)] text-[var(--tt-color-warning)] border-[var(--tt-color-warning-border)]',
    red: 'bg-[var(--tt-color-negative-bg)] text-[var(--tt-color-negative)] border-[var(--tt-color-negative-border)]',
    gray: 'bg-[var(--tt-color-surface-muted)] text-[var(--tt-color-text-muted)] border-[var(--tt-color-border)]',
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
