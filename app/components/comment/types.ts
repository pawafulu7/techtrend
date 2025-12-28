/**
 * Comment Component Types
 *
 * Task 4: UI層実装 - 型定義
 */

export type CommentVisibility = 'PUBLIC' | 'PRIVATE';

export interface CommentResponse {
  id: string;
  articleId: string;
  userId: string;
  content: string;
  visibility: CommentVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCommentsResponse {
  comments: CommentResponse[];
  nextCursor: string | null;
  totalCount: number;
}

export interface CreateCommentInput {
  articleId: string;
  content: string;
  visibility: CommentVisibility;
}

export interface UpdateCommentInput {
  content?: string;
  visibility?: CommentVisibility;
}

export interface CommentSectionState {
  isAuthenticated: boolean;
  comments: CommentResponse[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CommentSectionActions {
  loadMore: () => Promise<void>;
  addComment: (comment: CommentResponse) => void;
  updateComment: (id: string, comment: Partial<CommentResponse>) => void;
  removeComment: (id: string) => void;
}
