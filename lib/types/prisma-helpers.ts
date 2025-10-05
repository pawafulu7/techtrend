// Prisma types for dynamic query helpers
// Note: Prisma import kept for type reference in JSDoc and future use

/**
 * Prisma Helper Types
 *
 * Type-safe helpers for dynamic Prisma queries.
 * Eliminates any types in API layer while maintaining flexibility.
 */

/**
 * Dynamic Select Type
 *
 * Type-safe dynamic field selection for Prisma queries.
 *
 * @template T - Prisma Select type (e.g., Prisma.ArticleSelect)
 */
export type DynamicSelect<T> = {
  [K in keyof T]?: boolean | object;
};

/**
 * Dynamic Where Type
 *
 * Type-safe dynamic where conditions for Prisma queries.
 *
 * @template T - Prisma WhereInput type
 */
export type DynamicWhere<T> = Partial<T>;

/**
 * Date Range Type
 *
 * Type-safe date range for filtering queries.
 */
export interface DateRange {
  gte?: Date;
  lte?: Date;
}

/**
 * API Error Type
 *
 * Standardized error structure for API responses.
 */
export interface ApiError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

/**
 * Type guard for API errors
 *
 * Validates that error has ApiError-specific properties (code, statusCode).
 *
 * @param error - Unknown error to validate
 * @returns true if error is ApiError with required properties
 */
export function isApiError(error: unknown): error is ApiError {
  if (!(error instanceof Error)) return false;

  // Type-safe property checking without any
  const candidate = error as Partial<ApiError>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.statusCode === 'number'
  );
}

/**
 * Create dynamic select object with type safety
 *
 * @template T - Prisma Select type
 * @param fields - Array of field names to select
 * @returns Type-safe select object
 */
export function createDynamicSelect<T>(
  fields: (keyof T)[]
): DynamicSelect<T> {
  const select: DynamicSelect<T> = {};
  fields.forEach(field => {
    select[field] = true;
  });
  return select;
}

/**
 * Create date range where condition
 *
 * @param from - Start date (optional)
 * @param to - End date (optional)
 * @returns Date range object or undefined
 */
export function createDateRange(
  from?: Date,
  to?: Date
): DateRange | undefined {
  if (!from && !to) return undefined;

  const range: DateRange = {};
  if (from) range.gte = from;
  if (to) range.lte = to;

  return range;
}

/**
 * Safe property access for dynamic objects
 *
 * @template T - Object type
 * @template K - Key type
 * @param obj - Object to access
 * @param key - Property key
 * @returns Property value or undefined
 */
export function safeGet<T extends object, K extends keyof T>(
  obj: T | null | undefined,
  key: K
): T[K] | undefined {
  if (!obj) return undefined;
  return obj[key];
}

/**
 * Validate and cast error to ApiError
 *
 * @param error - Unknown error
 * @param defaultMessage - Default message if error is not Error instance
 * @returns ApiError instance
 */
export function toApiError(
  error: unknown,
  defaultMessage = 'An error occurred'
): ApiError {
  if (error instanceof Error) {
    // Check if already is ApiError
    if (isApiError(error)) {
      return error;
    }

    // Create new ApiError preserving original properties (avoid mutation)
    const apiError = Object.create(
      Object.getPrototypeOf(error),
      Object.getOwnPropertyDescriptors(error)
    ) as ApiError;
    apiError.code = 'UNKNOWN_ERROR';
    apiError.statusCode = 500;
    return apiError;
  }

  // Create new ApiError for non-Error values
  const apiError = new Error(defaultMessage) as ApiError;
  apiError.code = 'UNKNOWN_ERROR';
  apiError.statusCode = 500;
  apiError.details = error;
  return apiError;
}
