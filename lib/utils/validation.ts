/**
 * Input validation utilities for API endpoints
 */

/**
 * Parse and validate integer parameters from query strings
 * @param value - The string value to parse
 * @param defaultValue - Default value to use if parsing fails or value is invalid
 * @param options - Optional validation constraints
 * @returns Object containing the parsed value and optional error message
 */
export function parseIntParam(
  value: string | null,
  defaultValue: number,
  options?: {
    min?: number;
    max?: number;
    paramName?: string;
  }
): { value: number; error?: string } {
  // If no value provided, return default
  if (!value) {
    return { value: defaultValue };
  }

  // Parse the integer
  const parsed = parseInt(value, 10);
  
  // Check if parsing resulted in NaN
  if (isNaN(parsed)) {
    return {
      value: defaultValue,
      error: `Invalid ${options?.paramName || 'number'} parameter: "${value}"`
    };
  }

  // Check minimum constraint
  if (options?.min !== undefined && parsed < options.min) {
    return {
      value: defaultValue,
      error: `${options?.paramName || 'Parameter'} must be at least ${options.min}`
    };
  }

  // Check maximum constraint
  if (options?.max !== undefined && parsed > options.max) {
    return {
      value: defaultValue,
      error: `${options?.paramName || 'Parameter'} must be at most ${options.max}`
    };
  }

  // Return successfully parsed value
  return { value: parsed };
}

/**
 * Common validation ranges for API parameters
 */
export const VALIDATION_RANGES = {
  days: { min: 1, max: 365 },
  page: { min: 1, max: 1000 },
  limit: { min: 1, max: 100 },
  quality: { min: 0, max: 100 },
  tagDays: { min: 1, max: 30 }
} as const;