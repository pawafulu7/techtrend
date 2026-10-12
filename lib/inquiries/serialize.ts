/**
 * 管理 API が返す問い合わせの形（一覧と更新で共通、サーバーだけで使う）
 */
import type { Prisma } from '@/lib/prisma-exports';
import type { InquiryListItem } from '@/app/admin/inquiries/_types';

export const INQUIRY_LIST_SELECT = {
  id: true,
  category: true,
  status: true,
  message: true,
  contactEmail: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, deletedAt: true } },
} as const satisfies Prisma.InquirySelect;

type InquiryRow = Prisma.InquiryGetPayload<{
  select: typeof INQUIRY_LIST_SELECT;
}>;

export function toInquiryListItem(row: InquiryRow): InquiryListItem {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    message: row.message,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: row.user
      ? {
          id: row.user.id,
          name: row.user.name,
          email: row.user.email,
          deletedAt: row.user.deletedAt?.toISOString() ?? null,
        }
      : null,
  };
}
