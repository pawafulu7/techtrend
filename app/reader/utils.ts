export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${h}:${m}`;
  } catch {
    return '';
  }
}
