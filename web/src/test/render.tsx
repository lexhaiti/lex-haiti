/**
 * Test render helper — wraps components in the providers a real page sees.
 *
 * Add new providers here as the app grows. Most components only need
 * LanguageProvider for now.
 */
import { type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { LanguageProvider } from '@/i18n/LanguageContext'

function Providers({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: Providers, ...options })
}

// Re-export everything from RTL for convenience.
export * from '@testing-library/react'
