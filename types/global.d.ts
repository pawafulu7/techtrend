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

// Prisma Extended Types - REMOVED
// The interface augmentation was causing type shadowing issues
// Optional fields (thumbnail, articlesDisplayed, etc.) should be handled
// through separate helper types or Prisma.$ArticlePayload extensions

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
