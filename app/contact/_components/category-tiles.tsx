'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  INQUIRY_CATEGORIES,
  INQUIRY_CATEGORY_DESCRIPTIONS,
  INQUIRY_CATEGORY_LABELS,
  isInquiryCategory,
  type InquiryCategory,
} from '@/lib/inquiries/constants';
import { cn } from '@/lib/utils';
import { INQUIRY_CATEGORY_ICONS } from '@/app/components/inquiries/category-icons';

interface CategoryTilesProps {
  value: InquiryCategory | undefined;
  onChange: (value: InquiryCategory) => void;
  onBlur: () => void;
  /** react-hook-form がエラー時にフォーカスを移す先（最初の選択肢につなぐ） */
  inputRef?: (element: HTMLButtonElement | null) => void;
  /** グループの名前になる見出しの id */
  labelId: string;
  /** エラーの文言の id（エラーがあるときだけ） */
  errorId?: string;
}

/**
 * 種別を選ぶタイル。タイル全体が label で、中の丸（RadioGroupItem）で「1つだけ選べる」ことを示す。
 * 選択中とフォーカスは丸を含むタイル全体の枠と背景で表す（色だけに頼らず、丸の塗りでも分かる）
 */
export function CategoryTiles({
  value,
  onChange,
  onBlur,
  inputRef,
  labelId,
  errorId,
}: CategoryTilesProps) {
  const invalid = Boolean(errorId);

  return (
    <div className="@container">
      <RadioGroup
        value={value ?? ''}
        onValueChange={(next) => {
          if (isInquiryCategory(next)) onChange(next);
        }}
        onBlur={onBlur}
        aria-labelledby={labelId}
        aria-describedby={errorId}
        aria-invalid={invalid || undefined}
        aria-required="true"
        className="grid gap-3 @md:grid-cols-3"
        data-testid="inquiry-category-group"
      >
        {INQUIRY_CATEGORIES.map((category, index) => {
          const Icon = INQUIRY_CATEGORY_ICONS[category];
          const id = `inquiry-category-${category}`;
          const nameId = `${id}-name`;
          const descriptionId = `${id}-description`;

          return (
            <Label
              key={category}
              htmlFor={id}
              className={cn(
                'group flex cursor-pointer items-start gap-3 rounded-lg border p-3 leading-normal font-normal',
                'border-(--tt-color-border) bg-(--tt-color-surface) transition-colors hover:border-(--tt-color-border-hover)',
                'has-[[data-state=checked]]:border-(--tt-color-primary) has-[[data-state=checked]]:bg-(--tt-color-primary-bg)',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--tt-color-primary) has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-(--tt-color-background)',
                invalid && 'border-(--tt-color-negative-border)'
              )}
            >
              <RadioGroupItem
                ref={index === 0 ? inputRef : undefined}
                value={category}
                id={id}
                // タイルの label は説明文も包むので、名前は種別名だけにする（説明は describedby で読む）
                aria-labelledby={nameId}
                aria-describedby={descriptionId}
                className="mt-0.5"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  id={nameId}
                  className="flex items-center gap-1.5 text-sm font-medium text-(--tt-color-text)"
                >
                  <Icon
                    className="h-4 w-4 shrink-0 text-(--tt-color-text-muted) group-has-[[data-state=checked]]:text-(--tt-color-primary)"
                    aria-hidden="true"
                  />
                  {INQUIRY_CATEGORY_LABELS[category]}
                </span>
                <span
                  id={descriptionId}
                  className="text-xs [word-break:auto-phrase] text-(--tt-color-text-muted)"
                >
                  {INQUIRY_CATEGORY_DESCRIPTIONS[category]}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
