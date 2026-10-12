/**
 * 管理画面の問い合わせの TanStack Query のキー
 *
 * 一覧の取得（inquiries-page-content）と更新後の無効化（inquiry-detail-dialog）で同じ基底のキーを
 * 使い、片方だけ変えて無効化が効かなくなるのを防ぐ。先頭の 'admin' は QueryProvider が
 * ログアウト時に捨てる接頭辞（app/providers/query-provider.tsx）
 */
import type { InquiryStatusFilter } from './types';

export const inquiryQueryKeys = {
  all: ['admin', 'inquiries'] as const,
  list: (params: { page: number; status: InquiryStatusFilter }) =>
    [...inquiryQueryKeys.all, params] as const,
};
