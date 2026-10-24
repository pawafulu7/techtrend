/**
 * Re-export from shared dashboard components
 * This file maintains backward compatibility with existing imports
 */
export {
  MetricsCard,
  CompactMetricsCard,
  MetricsGroup,
} from '@/components/dashboard/MetricsCard';
export type {
  MetricsCardProps,
  CompactMetricsCardProps,
  MetricsGroupProps,
} from '@/components/dashboard/MetricsCard';

export { MetricsCard as default } from '@/components/dashboard/MetricsCard';
