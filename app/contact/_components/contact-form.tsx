'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useController, useForm, useWatch, type Control } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { authClient } from '@/lib/auth/auth-client';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import {
  INQUIRY_EMAIL_MAX_LENGTH,
  INQUIRY_MESSAGE_HINTS,
  INQUIRY_MESSAGE_MAX_LENGTH,
  type InquiryCategory,
} from '@/lib/inquiries/constants';
import { normalizeInquiryMessage } from '@/lib/inquiries/normalize';
import { cn } from '@/lib/utils';
import { CategoryTiles } from './category-tiles';

export interface ContactSubmitResult {
  /** 返信先がある（アカウントに紐付いた、またはメールを入れた） */
  hasReplyChannel: boolean;
  /** ログイン中のつもりで送ったが、送信時にはログインが切れていた */
  sessionLost: boolean;
}

interface ContactFormValues {
  category: InquiryCategory | undefined;
  message: string;
  contactEmail: string;
}

interface ContactFormProps {
  signedInEmail: string | null;
  /** 「続けて送る」で作り直したときは種別にフォーカスを移す */
  focusCategoryOnMount: boolean;
  onSubmitted: (result: ContactSubmitResult) => void;
}

// 画面側の簡易な形式チェック。最終的な判定は API（zod の email）が行う
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MESSAGES = {
  category: '種別を選んでください',
  messageEmpty: '内容を書いてください',
  messageTooLong: `${INQUIRY_MESSAGE_MAX_LENGTH} 文字以内で書いてください`,
  email: 'メールアドレスの形式を確かめてください',
  tooLarge: '内容が長すぎます。短くしてから送ってください',
  generic: '送信できませんでした。時間をおいてもう一度送ってください',
} as const;

// API が 400 で返す項目名と、その項目の下に出す文言
const FIELD_ERRORS: Record<
  string,
  { name: keyof ContactFormValues; message: string }
> = {
  category: { name: 'category', message: MESSAGES.category },
  message: { name: 'message', message: '内容を確かめてください' },
  contactEmail: { name: 'contactEmail', message: MESSAGES.email },
};

function rateLimitMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter);
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return '送信が続いたため受け付けを止めています。しばらくしてからもう一度送ってください';
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `送信が続いたため受け付けを止めています。約 ${minutes} 分後にもう一度送ってください`;
}

/** aria-describedby に渡す id を空白でつなぐ（無い id は飛ばす） */
function joinIds(...ids: Array<string | false | undefined>): string {
  return ids.filter(Boolean).join(' ');
}

/** 正規化した後の文字数（API が数えるのと同じ値） */
function MessageCounter({
  control,
  id,
}: {
  control: Control<ContactFormValues>;
  id: string;
}) {
  const value = useWatch({ control, name: 'message' }) ?? '';
  const length = normalizeInquiryMessage(value).length;
  const over = length > INQUIRY_MESSAGE_MAX_LENGTH;

  return (
    <span
      id={id}
      className={cn(
        'shrink-0 text-xs tabular-nums',
        over ? 'text-(--tt-color-negative)' : 'text-(--tt-color-text-muted)'
      )}
    >
      {length} / {INQUIRY_MESSAGE_MAX_LENGTH}
    </span>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-(--tt-color-negative)">
      {message}
    </p>
  );
}

export function ContactForm({
  signedInEmail: initialSignedInEmail,
  focusCategoryOnMount,
  onSubmitted,
}: ContactFormProps) {
  const ids = useId();
  const fieldId = (name: string) => `${ids}-${name}`;

  // 初めは Server の判定を使い、hydration の後はクライアントのセッションに合わせる
  // （別のタブでログアウトしたときなどに、返信先の欄と説明を切り替えるため）
  const { data: session, isPending } = authClient.useSession();
  const isHydrated = useIsHydrated();
  const signedInEmail =
    isHydrated && !isPending
      ? (session?.user?.email ?? null)
      : initialSignedInEmail;

  const formRef = useRef<HTMLFormElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ContactFormValues>({
    defaultValues: { category: undefined, message: '', contactEmail: '' },
  });

  // 種別は本文・メールの register より先に登録する。react-hook-form はエラー時に登録順で
  // 最初の誤りへフォーカスを移すので、<Controller>（子の描画で後から登録される）にすると
  // 画面の順と食い違い、未入力で送ったときに種別ではなく本文へフォーカスが移る
  const { field: categoryField } = useController({
    control,
    name: 'category',
    rules: { required: MESSAGES.category },
  });
  const category = categoryField.value;

  useEffect(() => {
    if (!focusCategoryOnMount) return;
    formRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
  }, [focusCategoryOnMount]);

  const onSubmit = async (values: ContactFormValues) => {
    // 送信中の押下は無視する（ボタンは disabled にせず、フォーカスを残す）
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);

    const sentAsSignedIn = signedInEmail !== null;
    const contactEmail = sentAsSignedIn ? '' : values.contactEmail.trim();

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: values.category,
          message: values.message,
          ...(sentAsSignedIn ? {} : { contactEmail }),
          website: honeypotRef.current?.value ?? '',
        }),
      });

      if (response.status === 201) {
        const json = await response.json().catch(() => null);
        const linkedToAccount = json?.data?.linkedToAccount === true;
        onSubmitted({
          hasReplyChannel: linkedToAccount || contactEmail !== '',
          sessionLost: sentAsSignedIn && !linkedToAccount,
        });
        return;
      }

      if (response.status === 400) {
        const json = await response.json().catch(() => null);
        const target = FIELD_ERRORS[json?.error?.field as string];
        if (target) {
          setError(
            target.name,
            { type: 'server', message: target.message },
            { shouldFocus: true }
          );
        } else {
          setFormError(MESSAGES.generic);
        }
        return;
      }

      if (response.status === 413) {
        setFormError(MESSAGES.tooLarge);
        return;
      }

      if (response.status === 429) {
        setFormError(rateLimitMessage(response.headers.get('Retry-After')));
        return;
      }

      setFormError(MESSAGES.generic);
    } catch {
      setFormError(MESSAGES.generic);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const categoryErrorId = fieldId('category-error');
  const messageHintId = fieldId('message-hint');
  const messageCounterId = fieldId('message-counter');
  const messageErrorId = fieldId('message-error');
  const emailHintId = fieldId('email-hint');
  const emailErrorId = fieldId('email-error');

  return (
    <CardV2 className="p-4 sm:p-6">
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="relative space-y-6"
        aria-busy={submitting || undefined}
        data-testid="contact-form"
      >
        <div className="space-y-2">
          <span
            id={fieldId('category-label')}
            className="text-sm font-medium text-(--tt-color-text)"
          >
            種別
          </span>
          <CategoryTiles
            value={categoryField.value}
            onChange={categoryField.onChange}
            onBlur={categoryField.onBlur}
            inputRef={categoryField.ref}
            labelId={fieldId('category-label')}
            errorId={errors.category ? categoryErrorId : undefined}
          />
          <FieldError id={categoryErrorId} message={errors.category?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId('message')}>内容</Label>
          <p
            id={messageHintId}
            className="text-sm text-(--tt-color-text-muted)"
          >
            {INQUIRY_MESSAGE_HINTS[category ?? 'DEFAULT']}
          </p>
          <Textarea
            id={fieldId('message')}
            rows={8}
            className="min-h-40 resize-y text-base md:text-sm"
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={joinIds(
              messageHintId,
              messageCounterId,
              errors.message && messageErrorId
            )}
            {...register('message', {
              validate: (value) => {
                const length = normalizeInquiryMessage(value ?? '').length;
                if (length === 0) return MESSAGES.messageEmpty;
                if (length > INQUIRY_MESSAGE_MAX_LENGTH) {
                  return MESSAGES.messageTooLong;
                }
                return true;
              },
            })}
          />
          <div className="flex items-start justify-between gap-3">
            <FieldError id={messageErrorId} message={errors.message?.message} />
            <span className="ml-auto">
              <MessageCounter control={control} id={messageCounterId} />
            </span>
          </div>
        </div>

        {signedInEmail ? (
          <p className="text-sm text-(--tt-color-text-muted)">
            ログイン中のアカウント（
            <span className="font-medium break-all text-(--tt-color-text)">
              {signedInEmail}
            </span>
            ）として送信します。返信が要るときはこのアドレスに連絡します。
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={fieldId('email')}>
              返信先のメールアドレス（任意）
            </Label>
            <Input
              id={fieldId('email')}
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-invalid={errors.contactEmail ? true : undefined}
              aria-describedby={joinIds(
                emailHintId,
                errors.contactEmail && emailErrorId
              )}
              {...register('contactEmail', {
                validate: (value) => {
                  const trimmed = value.trim();
                  if (trimmed === '') return true;
                  return trimmed.length <= INQUIRY_EMAIL_MAX_LENGTH &&
                    EMAIL_PATTERN.test(trimmed)
                    ? true
                    : MESSAGES.email;
                },
              })}
            />
            <p
              id={emailHintId}
              className="text-sm text-(--tt-color-text-muted)"
            >
              返信が要るときだけ入れてください。返信のためだけに使います。
            </p>
            <FieldError
              id={emailErrorId}
              message={errors.contactEmail?.message}
            />
          </div>
        )}

        {/* bot 避けの隠し項目。人には見えず、Tab でも止まらず、読み上げにも出ない */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px overflow-hidden"
        >
          <label htmlFor={fieldId('hp')}>この欄は空のままにしてください</label>
          <input
            id={fieldId('hp')}
            ref={honeypotRef}
            name="hp_url"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <div className="space-y-3">
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-(--tt-color-negative-border) bg-(--tt-color-negative-bg) px-3 py-2 text-sm text-(--tt-color-negative)"
            >
              {formError}
            </p>
          )}
          <Button
            type="submit"
            className="min-h-11 w-full sm:w-auto"
            aria-disabled={submitting || undefined}
            data-disabled={submitting ? 'true' : undefined}
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {submitting ? '送信中…' : '送信する'}
          </Button>
        </div>
      </form>
    </CardV2>
  );
}
