'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui-v2/button-v2';
import { useToast } from '@/app/hooks/use-toast';
import { normalizeGateEmail } from '@/lib/auth/site-gate/email';
import {
  ADD_FAILED_MESSAGE,
  GateAllowlistActionError,
  addGateEmail,
  gateAllowlistQueryKey,
} from './gate-allowlist-api';

interface FormError {
  message: string;
  /** 入力の誤り（入力欄を赤くする）。429・500・通信の失敗は false */
  isInputError: boolean;
}

interface GateEmailAddFormProps {
  /** 一覧の読み込み中・失敗中は追加させない */
  disabled: boolean;
}

export function GateEmailAddForm({ disabled }: GateEmailAddFormProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<FormError | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (email: string) => addGateEmail(email),
    // 失敗しても一覧を取り直す（追加が済んだ後に応答だけ失われたとき、一覧を古いまま残さない）
    onSettled: () => queryClient.invalidateQueries({ queryKey: gateAllowlistQueryKey }),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 送信中の二重の送信は無視する
    if (mutation.isPending || disabled) return;

    const email = value.trim().toLowerCase();
    if (email === '') {
      setError({ message: 'Gmail アドレスを入力してください', isInputError: true });
      return;
    }
    if (normalizeGateEmail(email) === null) {
      setError({ message: '@gmail.com のアドレスを入力してください', isInputError: true });
      return;
    }

    setError(null);
    mutation.mutate(email, {
      onSuccess: (added) => {
        setValue('');
        toast({ title: `${added} を追加しました` });
        inputRef.current?.focus();
      },
      onError: (cause) => {
        setError(
          cause instanceof GateAllowlistActionError
            ? { message: cause.message, isInputError: cause.isInputError }
            : { message: ADD_FAILED_MESSAGE, isInputError: false }
        );
        inputRef.current?.focus();
      },
    });
  };

  const isInvalid = error?.isInputError === true;

  return (
    <form noValidate onSubmit={submit} className="max-w-md space-y-2">
      <Label htmlFor={inputId}>Gmail アドレス</Label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@gmail.com"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            // 直し始めたら赤い表示を外す
            if (isInvalid) setError(null);
          }}
          aria-invalid={isInvalid || undefined}
          aria-describedby={`${hintId} ${errorId}`}
          disabled={disabled}
          className="h-10"
          data-testid="gate-email-input"
        />
        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={disabled}
          className="h-10 shrink-0"
          data-testid="gate-email-add"
        >
          追加
        </Button>
      </div>
      <p id={hintId} className="text-muted-foreground text-sm">
        {'Gmail（@gmail.com）のアドレスだけ追加できます。ドット（.）の有無は区別しないので、ドットを除いた形で保存します。'}
      </p>
      <p
        id={errorId}
        role="alert"
        className="text-sm text-(--tt-color-negative) empty:hidden"
        data-testid="gate-email-error"
      >
        {error?.message}
      </p>
    </form>
  );
}
