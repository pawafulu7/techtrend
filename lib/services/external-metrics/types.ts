import { TechEntity, MetricSource } from '@prisma/client';

/**
 * Result of a single metric collection attempt.
 */
export interface MetricResult {
  value: number;
  measuredAt: Date;
}

/**
 * Interface for external metric collectors.
 * Each collector is responsible for a single MetricSource.
 */
export interface MetricCollector {
  /** The metric source this collector handles */
  source: MetricSource;

  /** Check if the entity has the relevant externalIds key for this collector */
  canCollect(entity: TechEntity): boolean;

  /** Collect the metric value for the entity. Returns null on failure/skip. */
  collect(entity: TechEntity): Promise<MetricResult | null>;
}

/**
 * Type guard for externalIds JSON field.
 * externalIds structure: { github?: string, npm?: string, pypi?: string, stackoverflow?: string }
 */
export interface ExternalIds {
  github?: string;
  npm?: string;
  pypi?: string;
  stackoverflow?: string;
}

/**
 * Parse externalIds from TechEntity's Json? field.
 */
export function parseExternalIds(externalIds: unknown): ExternalIds | null {
  if (!externalIds || typeof externalIds !== 'object') {
    return null;
  }
  return externalIds as ExternalIds;
}

/**
 * Summary of a collection run.
 */
export interface CollectionSummary {
  collected: number;
  errors: number;
  skipped: number;
}
