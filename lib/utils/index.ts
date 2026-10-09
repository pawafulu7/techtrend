import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { textStyles } from '@/lib/design-tokens/scales';

// text-h1 などの役割のクラスは文字サイズとして扱う。登録しないと文字色（text-foreground など）と
// 同じ種類と見なされ、併せて書いた方に消される
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: Object.keys(textStyles) }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
