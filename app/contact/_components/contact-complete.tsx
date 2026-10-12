'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui-v2/button-v2';
import type { ContactSubmitResult } from './contact-form';

interface ContactCompleteProps {
  result: ContactSubmitResult;
  onReset: () => void;
}

function completionMessage({
  hasReplyChannel,
  sessionLost,
}: ContactSubmitResult): string {
  if (hasReplyChannel) {
    return '内容を確認して、必要なときはご連絡します。';
  }
  const noReply = '受け付けました。返信先が無いため、個別のご連絡はしません。';
  return sessionLost
    ? `ログインが切れていたため、アカウントに紐付けずに受け付けました。${noReply}`
    : noReply;
}

export function ContactComplete({ result, onReset }: ContactCompleteProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // フォームから切り替わったことをスクリーンリーダーにも伝えるため、見出しにフォーカスを移す
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <CardV2 className="p-6 sm:p-8" data-testid="contact-complete">
      <CheckCircle2
        className="h-8 w-8 text-(--tt-color-positive)"
        aria-hidden="true"
      />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-h3 mt-3 text-(--tt-color-text) outline-none"
      >
        送信しました
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-(--tt-color-text-muted)">
        {completionMessage(result)}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild className="min-h-11">
          <Link href="/">記事一覧へ</Link>
        </Button>
        <Button variant="outline" className="min-h-11" onClick={onReset}>
          続けて送る
        </Button>
      </div>
    </CardV2>
  );
}
