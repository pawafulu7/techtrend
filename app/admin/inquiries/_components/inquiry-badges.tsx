import { Check, CircleDot, Clock, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui-v2/badge-v2';
import {
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUS_LABELS,
  type InquiryCategory,
  type InquiryStatus,
} from '@/lib/inquiries/constants';
import { INQUIRY_CATEGORY_ICONS } from '@/app/components/inquiries/category-icons';

// 注意が要るものほど目立たせ、終わったものは退かせる。色だけに頼らずアイコンも付ける。
// 「対応中」にブランドの緑を使わないのは、--tt-color-positive と同じ色で「完了」と読み違えるため
const STATUS_STYLES: Record<
  InquiryStatus,
  { variant: 'info' | 'outline' | 'default'; icon: LucideIcon }
> = {
  OPEN: { variant: 'info', icon: CircleDot },
  IN_PROGRESS: { variant: 'outline', icon: Clock },
  RESOLVED: { variant: 'default', icon: Check },
};

export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const { variant, icon: Icon } = STATUS_STYLES[status];
  return (
    <Badge variant={variant} className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {INQUIRY_STATUS_LABELS[status]}
    </Badge>
  );
}

/** 種別は色で区別しない（色の意味を対応状況だけに使う） */
export function InquiryCategoryBadge({
  category,
}: {
  category: InquiryCategory;
}) {
  const Icon = INQUIRY_CATEGORY_ICONS[category];
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {INQUIRY_CATEGORY_LABELS[category]}
    </Badge>
  );
}
