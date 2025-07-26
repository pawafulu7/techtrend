export type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  details?: unknown;
};

export type PaginationParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};