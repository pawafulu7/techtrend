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
                // 1列のときは アイコン・名前・丸 を横に並べ、3列のときはアイコンと丸の下に名前を置く
                'group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-lg border p-3 leading-normal font-normal @md:grid-cols-[auto_1fr] @md:gap-y-2',
                'border-(--tt-color-border-hover) bg-(--tt-color-surface-muted) transition-colors hover:border-(--tt-color-primary-border)',
                'has-[[data-state=checked]]:border-(--tt-color-primary) has-[[data-state=checked]]:bg-(--tt-color-primary-bg)',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--tt-color-primary) has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-(--tt-color-background)',
                invalid && 'border-(--tt-color-negative-border)'
              )}
            >
              {/* 選ぶと塗りに変わり、丸の塗りと合わせて選択中が分かる */}
              <span className="col-start-1 row-start-1 flex h-8 w-8 items-center justify-center rounded-md bg-(--tt-color-primary-bg) text-(--tt-color-primary) transition-colors group-has-[[data-state=checked]]:bg-(--tt-color-primary) group-has-[[data-state=checked]]:text-(--tt-color-on-primary)">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <RadioGroupItem
                ref={index === 0 ? inputRef : undefined}
                value={category}
                id={id}
                // タイルの label は説明文も包むので、名前は種別名だけにする（説明は describedby で読む）
                aria-labelledby={nameId}
                aria-describedby={descriptionId}
                className="col-start-3 row-start-1 @md:col-start-2 @md:justify-self-end"
              />
              <span className="col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5 @md:col-span-2 @md:col-start-1 @md:row-start-2">
                <span
                  id={nameId}
                  className="text-sm font-medium text-(--tt-color-text)"
                >
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
