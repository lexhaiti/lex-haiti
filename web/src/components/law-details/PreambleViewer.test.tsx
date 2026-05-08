import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PreambleViewer from './PreambleViewer'

describe('PreambleViewer', () => {
  it('renders the title and the body text', () => {
    render(
      <PreambleViewer
        title="Constitution haïtienne de 1987"
        text={'Préambule\n\nLe peuple haïtien proclame.'}
        currentLang="fr"
      />,
    )
    expect(
      screen.getByText('Constitution haïtienne de 1987'),
    ).toBeInTheDocument()
    expect(screen.getByText('Préambule')).toBeInTheDocument()
    expect(
      screen.getByText('Le peuple haïtien proclame.'),
    ).toBeInTheDocument()
  })

  it('shows an empty state when text is null', () => {
    render(
      <PreambleViewer
        title="Texte vide"
        text={null}
        currentLang="fr"
      />,
    )
    expect(
      screen.getByText('Aucun contenu disponible'),
    ).toBeInTheDocument()
  })

  it('uses Kreyòl labels when currentLang is ht', () => {
    render(
      <PreambleViewer title="Tit" text={'Yon paragraf'} currentLang="ht" />,
    )
    expect(screen.getByText('Yon paragraf')).toBeInTheDocument()
    expect(screen.getByText(/minit/)).toBeInTheDocument() // reading-time label
  })

  it('splits double-newlines into separate paragraphs', () => {
    const text = 'Premier paragraphe.\n\nDeuxième paragraphe.'
    const { container } = render(
      <PreambleViewer title="T" text={text} currentLang="fr" />,
    )
    const paragraphs = container.querySelectorAll('article p')
    expect(paragraphs.length).toBe(2)
  })
})
