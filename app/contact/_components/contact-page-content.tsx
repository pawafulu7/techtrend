'use client';

import { useState } from 'react';
import { ContactForm, type ContactSubmitResult } from './contact-form';
import { ContactComplete } from './contact-complete';

interface ContactPageContentProps {
  /** Server で判定したログイン中のアカウントのメール（未ログインは null） */
  signedInEmail: string | null;
}

/** 送信前はフォーム、送信後は完了表示に切り替える */
export function ContactPageContent({ signedInEmail }: ContactPageContentProps) {
  const [result, setResult] = useState<ContactSubmitResult | null>(null);
  // 「続けて送る」でフォームを空の状態から作り直すためのキー
  const [formKey, setFormKey] = useState(0);

  if (result) {
    return (
      <ContactComplete
        result={result}
        onReset={() => {
          setResult(null);
          setFormKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <ContactForm
      key={formKey}
      signedInEmail={signedInEmail}
      focusCategoryOnMount={formKey > 0}
      onSubmitted={setResult}
    />
  );
}
