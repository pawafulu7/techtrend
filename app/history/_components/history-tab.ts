/** /history の ?tab= の値。analytics のときだけ読書分析を出し、それ以外は閲覧履歴 */
export function isAnalyticsTab(tab: string | string[] | null | undefined) {
  return tab === 'analytics';
}
