/**
 * Graph visualization helper utilities shared between UI and tests.
 */

export function darkenColor(hexColor: string, factor: number): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return hexColor;

  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  const clampChannel = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

  const rDark = clampChannel(r * factor);
  const gDark = clampChannel(g * factor);
  const bDark = clampChannel(b * factor);

  return `#${rDark.toString(16).padStart(2, '0')}${gDark.toString(16).padStart(2, '0')}${bDark
    .toString(16)
    .padStart(2, '0')}`;
}

export function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  return `${label.substring(0, maxLength)}...`;
}
