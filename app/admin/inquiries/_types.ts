import type { InquiryCategory, InquiryStatus } from '@/lib/inquiries/constants';

/** 管理画面の一覧・詳細に出す問い合わせ（日時は ISO 8601 の文字列） */
export interface InquiryListItem {
  id: string;
  category: InquiryCategory;
  status: InquiryStatus;
  /** 利用者が書いた生の文字列。React のテキストとしてだけ描画する */
  message: string;
  /** 返信先（未ログインは本人確認していない入力、ログイン中は送信時のアカウントのメール） */
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  /** 送ったアカウント。未ログインで送ったときと、アカウントが消えたときは null */
  user: {
    id: string;
    name: string | null;
    email: string;
    deletedAt: string | null;
  } | null;
}

export type InquiryStatusFilter = InquiryStatus | 'all';

export interface InquiryCounts {
  OPEN: number;
  IN_PROGRESS: number;
  RESOLVED: number;
  all: number;
}

export interface AdminInquiriesResponse {
  data: InquiryListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  counts: InquiryCounts;
}

export interface AdminInquiryUpdateResponse {
  data: InquiryListItem;
}
