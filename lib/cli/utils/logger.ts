import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export const logger = {
  info: (msg: string) => {
    const timestamp = format(new Date(), 'HH:mm:ss', { locale: ja });
    console.log(`[${timestamp}] ℹ️  ${msg}`);
  },
  
  success: (msg: string) => {
    const timestamp = format(new Date(), 'HH:mm:ss', { locale: ja });
    console.log(`[${timestamp}] ✅ ${msg}`);
  },
  
  error: (msg: string, error?: unknown) => {
    const timestamp = format(new Date(), 'HH:mm:ss', { locale: ja });
    console.error(`[${timestamp}] ❌ ${msg}`);
    if (error instanceof Error) {
      console.error(`[${timestamp}]    ${error.message}`);
    }
  },
  
  warn: (msg: string) => {
    const timestamp = format(new Date(), 'HH:mm:ss', { locale: ja });
    console.warn(`[${timestamp}] ⚠️  ${msg}`);
  },
  
  debug: (msg: string) => {
    if (process.env.DEBUG) {
      const timestamp = format(new Date(), 'HH:mm:ss', { locale: ja });
      console.log(`[${timestamp}] 🐛 ${msg}`);
    }
  }
};