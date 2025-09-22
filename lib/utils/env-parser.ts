/**
 * Environment variable parsing utilities
 * 環境変数を安全に解析するためのユーティリティ関数
 */

/**
 * Parse boolean value from environment variable
 * 環境変数からブール値を安全に解析
 *
 * @param value - The environment variable value
 * @param defaultValue - Default value when undefined
 * @returns Parsed boolean value
 *
 * @example
 * parseBoolean('true') // true
 * parseBoolean('false') // false
 * parseBoolean('FALSE') // false
 * parseBoolean('0') // false
 * parseBoolean('no') // false
 * parseBoolean('off') // false
 * parseBoolean(undefined, true) // true
 */
export function parseBoolean(value: string | undefined, defaultValue = true): boolean {
  if (value === undefined) return defaultValue;

  // Normalize the value: trim whitespace and convert to lowercase
  const normalizedValue = value.trim().toLowerCase();

  // Explicit list of values that should be considered as true
  const trueValues = ['true', '1', 'yes', 'on', 'enabled'];

  // List of values that should be considered as false
  const falseValues = ['false', '0', 'no', 'off', 'disabled'];

  // Check against explicit true values
  if (trueValues.includes(normalizedValue)) return true;

  // Check against explicit false values
  if (falseValues.includes(normalizedValue)) return false;

  // Unknown value - return default
  return defaultValue;
}

/**
 * Parse integer value from environment variable
 * 環境変数から整数値を安全に解析
 *
 * @param value - The environment variable value
 * @param defaultValue - Default value when undefined or invalid
 * @returns Parsed integer value
 */
export function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse string value from environment variable with validation
 * 環境変数から文字列値を検証付きで解析
 *
 * @param value - The environment variable value
 * @param defaultValue - Default value when undefined
 * @param allowedValues - Optional array of allowed values
 * @returns Validated string value
 */
export function parseString(
  value: string | undefined,
  defaultValue: string,
  allowedValues?: string[]
): string {
  if (value === undefined) return defaultValue;

  const trimmedValue = value.trim();

  if (allowedValues && !allowedValues.includes(trimmedValue)) {
    return defaultValue;
  }

  return trimmedValue;
}