import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatButton } from '@/components/chat/ChatButton';

describe('ChatButton', () => {
  it('renders chat button', () => {
    render(
      <ChatButton 
        isOpen={false} 
        onClick={() => {}} 
      />
    );
    
    const button = screen.getByTestId('chat-button');
    expect(button).toBeInTheDocument();
  });

  it('shows message icon when closed', () => {
    render(
      <ChatButton 
        isOpen={false} 
        onClick={() => {}} 
      />
    );
    
    const button = screen.getByTestId('chat-button');
    expect(button).toHaveAttribute('aria-label', 'チャットを開く');
  });

  it('shows close icon when open', () => {
    render(
      <ChatButton 
        isOpen={true} 
        onClick={() => {}} 
      />
    );
    
    const button = screen.getByTestId('chat-button');
    expect(button).toHaveAttribute('aria-label', 'チャットを閉じる');
  });

  it('displays unread count badge', () => {
    render(
      <ChatButton 
        isOpen={false} 
        onClick={() => {}} 
        unreadCount={3}
      />
    );
    
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays 9+ for unread count over 9', () => {
    render(
      <ChatButton 
        isOpen={false} 
        onClick={() => {}} 
        unreadCount={15}
      />
    );
    
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(
      <ChatButton 
        isOpen={false} 
        onClick={handleClick} 
      />
    );
    
    fireEvent.click(screen.getByTestId('chat-button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});