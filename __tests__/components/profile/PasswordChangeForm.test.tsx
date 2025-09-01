import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import '@testing-library/jest-dom';

// Mock fetch
global.fetch = jest.fn();

describe('PasswordChangeForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Initial rendering', () => {
    it('should render all form fields', () => {
      render(<PasswordChangeForm />);
      
      expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument();
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
      expect(screen.getByLabelText('新しいパスワード（確認）')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'パスワードを変更' })).toBeInTheDocument();
    });

    it('should show password requirements helper text', () => {
      render(<PasswordChangeForm />);
      
      expect(screen.getByText(/8文字以上で、大文字、小文字、数字を含めてください/)).toBeInTheDocument();
    });

    it('should have all fields initially empty', () => {
      render(<PasswordChangeForm />);
      
      const currentPassword = screen.getByLabelText('現在のパスワード') as HTMLInputElement;
      const newPassword = screen.getByLabelText('新しいパスワード') as HTMLInputElement;
      const confirmPassword = screen.getByLabelText('新しいパスワード（確認）') as HTMLInputElement;
      
      expect(currentPassword.value).toBe('');
      expect(newPassword.value).toBe('');
      expect(confirmPassword.value).toBe('');
    });
  });

  describe('Form validation', () => {
    it('should show error when new password is too short', async () => {
      const user = userEvent.setup();
      render(<PasswordChangeForm />);
      
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordField, 'short');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/パスワードは8文字以上である必要があります/)).toBeInTheDocument();
      });
    });

    it('should show error when new password lacks required characters', async () => {
      const user = userEvent.setup();
      render(<PasswordChangeForm />);
      
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordField, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/パスワードは大文字、小文字、数字を含む必要があります/)).toBeInTheDocument();
      });
    });

    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'DifferentPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument();
      });
    });

    it('should show error when current password is empty', async () => {
      const user = userEvent.setup();
      render(<PasswordChangeForm />);
      
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('現在のパスワードを入力してください')).toBeInTheDocument();
      });
    });
  });

  describe('Form submission', () => {
    it('should submit form with valid data', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Password changed successfully' }),
      });
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/user/password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: 'CurrentPassword123',
            newPassword: 'NewPassword123',
            confirmPassword: 'NewPassword123',
          }),
        });
      });
      
      await waitFor(() => {
        expect(screen.getByText('パスワードを変更しました')).toBeInTheDocument();
      });
    });

    it('should clear form after successful submission', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Password changed successfully' }),
      });
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード') as HTMLInputElement;
      const newPasswordField = screen.getByLabelText('新しいパスワード') as HTMLInputElement;
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）') as HTMLInputElement;
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(currentPasswordField.value).toBe('');
        expect(newPasswordField.value).toBe('');
        expect(confirmPasswordField.value).toBe('');
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true }),
        }), 100))
      );
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      expect(screen.getByText('変更中...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
      
      await waitFor(() => {
        expect(screen.queryByText('変更中...')).not.toBeInTheDocument();
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Error handling', () => {
    it('should display error when current password is incorrect', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Current password is incorrect' }),
      });
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'WrongPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });

    it('should display error when user is not authenticated', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      });
    });

    it('should display generic error on network failure', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'NewPassword123');
      await user.type(confirmPasswordField, 'NewPassword123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should display validation errors from API', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'Validation failed',
          details: {
            newPassword: ['Password is too common']
          }
        }),
      });
      
      render(<PasswordChangeForm />);
      
      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード');
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      
      await user.type(currentPasswordField, 'CurrentPassword123');
      await user.type(newPasswordField, 'Password123');
      await user.type(confirmPasswordField, 'Password123');
      
      const submitButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Validation failed')).toBeInTheDocument();
      });
    });
  });
});