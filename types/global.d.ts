// Global type augmentations and fixes

// Extended NodeJS global
declare global {
  namespace NodeJS {
    interface Global {
      [key: string]: any;
    }
  }
}

// Extended Window object for browser globals
declare global {
  interface Window {
    [key: string]: any;
  }
}

// Redis Mock Types
declare module 'ioredis' {
  interface Redis {
    pipeline(): any;
    flushdb(): Promise<string>;
  }
}

// Prisma Extended Types
declare module '@prisma/client' {
  interface Article {
    thumbnail?: string | null;
    articlesDisplayed?: number;
    articlesCount?: number;
    difficulty?: string | null;
  }
  
  interface Tag {
    category?: string | null;
  }
}

// Test Mock Helpers

// Extended fetch types
declare global {
  interface RequestInit {
    next?: {
      revalidate?: number | false;
      tags?: string[];
    };
  }
}

export {};