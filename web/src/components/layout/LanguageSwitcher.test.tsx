import { describe, expect, it, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { LanguageSwitcher } from './LanguageSwitcher'
import { renderWithProviders, screen } from '@/test/render'

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    // Reset persisted language between tests so we always start in FR.
    window.localStorage.clear()
  })

  it('renders the trigger with the FR flag by default', () => {
    renderWithProviders(<LanguageSwitcher />)

    const trigger = screen.getByRole('button', { name: /Français/i })
    expect(trigger).toBeInTheDocument()
    // The responsive default renders the full language name (sm:inline);
    // the short "FR"/"HT" code is only shown by the `compact` variant.
    expect(trigger).toHaveTextContent('Français')
  })

  it('shows the compact variant as a short code', () => {
    renderWithProviders(<LanguageSwitcher variant="compact" />)
    const trigger = screen.getByRole('button', { name: /Français/i })
    expect(trigger).toHaveTextContent('FR')
  })

  it('lists both languages when opened and switches when one is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LanguageSwitcher />)

    await user.click(screen.getByRole('button', { name: /Français/i }))

    // Both options should appear in the dropdown menu.
    const french = await screen.findByRole('menuitem', { name: /Français/ })
    const kreyol = await screen.findByRole('menuitem', { name: /Kreyòl/ })
    expect(french).toBeInTheDocument()
    expect(kreyol).toBeInTheDocument()

    await user.click(kreyol)

    // After picking Kreyòl, the trigger should reflect the new selection.
    expect(
      screen.getByRole('button', { name: /Kreyòl/i }),
    ).toHaveTextContent('Kreyòl')

    // ...and the choice persists.
    expect(window.localStorage.getItem('lexhaiti:lang')).toBe('ht')
  })

  it('renders the wide variant with the full language name', () => {
    renderWithProviders(<LanguageSwitcher variant="wide" />)

    const trigger = screen.getByRole('button', { name: /Français/i })
    expect(trigger).toHaveTextContent('Français')
  })
})
