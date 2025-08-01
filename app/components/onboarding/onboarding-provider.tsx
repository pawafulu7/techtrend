'use client';

import { ReactNode } from 'react';
import { WelcomeTour } from './welcome-tour';

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  return (
    <>
      {children}
      <WelcomeTour />
    </>
  );
}