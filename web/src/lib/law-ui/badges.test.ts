import { describe, expect, it } from 'vitest'
import { badgeForLaw, statusLabel } from './badges'

describe('statusLabel', () => {
  it('returns French label for in_force', () => {
    expect(statusLabel('in_force')).toBe('En vigueur')
  })

  it('returns French label for abrogated', () => {
    expect(statusLabel('abrogated')).toBe('Abrogé')
  })

  it('returns French label for partially_abrogated', () => {
    expect(statusLabel('partially_abrogated')).toBe('Partiellement abrogé')
  })
})

describe('badgeForLaw', () => {
  it('marks in_force as success', () => {
    const badge = badgeForLaw({
      status: 'in_force',
      category: 'loi',
    })
    expect(badge.tone).toBe('success')
    expect(badge.icon).toBeDefined()
    expect(badge.text).toBe('En vigueur')
  })

  it('marks abrogated as danger', () => {
    const badge = badgeForLaw({
      status: 'abrogated',
      category: 'loi',
    })
    expect(badge.tone).toBe('danger')
  })

  it('marks partially_abrogated as warning', () => {
    const badge = badgeForLaw({
      status: 'partially_abrogated',
      category: 'loi',
    })
    expect(badge.tone).toBe('warning')
  })
})
