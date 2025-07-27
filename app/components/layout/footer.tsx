import { SITE_NAME } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div className="text-sm text-muted-foreground">
            © 2025 {SITE_NAME}. All rights reserved.
          </div>
          <div className="flex items-center space-x-6">
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a 
              href="/api/health" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              API Status
            </a>
          </div>
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">
          Powered by Next.js, Prisma, and Gemini AI
        </div>
      </div>
    </footer>
  );
}