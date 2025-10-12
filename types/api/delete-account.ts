import { z } from 'zod';

export const CONFIRMATION_WORD = 'DELETE' as const;

export const DeleteAccountRequestSchema = z.object({
  password: z.string().optional(),
  confirmationWord: z.literal(CONFIRMATION_WORD),
  reason: z.string().max(500).optional(),
});

export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

export interface DeleteAccountResponse {
  success: true;
  message: string;
  requiresLogout: true;
}

export interface DeleteAccountError {
  success: false;
  error:
    | 'INVALID_PASSWORD'
    | 'INVALID_CONFIRMATION'
    | 'UNAUTHORIZED'
    | 'USER_NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'INTERNAL_ERROR';
  message: string;
}

export type DeleteAccountResult = DeleteAccountResponse | DeleteAccountError;
