import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ServerPaginationProps {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

export function ServerPagination({ currentPage, totalPages, searchParams }: ServerPaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5; // Number of page buttons to show
    
    if (totalPages <= showPages) {
      // Show all pages if total is less than showPages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && key !== 'page') {
        params.set(key, value);
      }
    });
    params.set('page', page.toString());
    return `/?${params.toString()}`;
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center justify-center space-x-2" data-testid="pagination-container">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === 1}
        asChild={currentPage !== 1}
        className="flex items-center gap-1 whitespace-nowrap"
        data-testid="pagination-prev"
      >
        {currentPage === 1 ? (
          <span className="flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            前へ
          </span>
        ) : (
          <Link href={buildPageUrl(currentPage - 1)} className="flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            前へ
          </Link>
        )}
      </Button>
      
      <div className="flex items-center space-x-1">
        {getPageNumbers().map((page, index) => (
          <div key={index}>
            {page === '...' ? (
              <span className="px-3 text-muted-foreground">...</span>
            ) : (
              <Button
                variant={currentPage === page ? 'default' : 'outline'}
                size="sm"
                className="min-w-[40px]"
                asChild={currentPage !== page}
                data-testid={currentPage === page ? 'pagination-current' : `pagination-button-${page}`}
              >
                {currentPage === page ? (
                  <span>{page}</span>
                ) : (
                  <Link href={buildPageUrl(page as number)}>{page}</Link>
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
      
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === totalPages}
        asChild={currentPage !== totalPages}
        className="flex items-center gap-1 whitespace-nowrap"
        data-testid="pagination-next"
      >
        {currentPage === totalPages ? (
          <span className="flex items-center gap-1">
            次へ
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Link href={buildPageUrl(currentPage + 1)} className="flex items-center gap-1">
            次へ
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </Button>
    </nav>
  );
}