import { Bug, Lightbulb, MessageCircle, type LucideIcon } from 'lucide-react';
import type { InquiryCategory } from '@/lib/inquiries/constants';

/** 問い合わせの種別のアイコン（送信画面のタイルと管理画面のバッジで共通） */
export const INQUIRY_CATEGORY_ICONS: Record<InquiryCategory, LucideIcon> = {
  FEATURE_REQUEST: Lightbulb,
  BUG_REPORT: Bug,
  OTHER: MessageCircle,
};
