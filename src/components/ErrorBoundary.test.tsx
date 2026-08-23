/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * Ohne Boundary riss ein einziger Render-Fehler die ganze App mit — genau das
 * passierte in 30 Sprachen beim Öffnen der Mitteilungen (siehe T1).
 */

const TEXTE = { titel: 'Anzeige gestört', text: 'Der Rest funktioniert weiter.', aktion: 'Neu laden' }

function Kaputt(): never {
  throw new Error('absichtlich')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React schreibt den gefangenen Fehler zusätzlich selbst ins Log —
    // erwartetes Rauschen, sonst wäre die Testausgabe unlesbar.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup() // ohne globals räumt Testing Library nicht von selbst auf
    vi.restoreAllMocks()
  })

  it('reicht fehlerfreie Kinder unverändert durch', () => {
    render(
      <ErrorBoundary {...TEXTE}>
        <p>Inhalt</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Inhalt')).toBeTruthy()
  })

  it('fängt den Fehler und zeigt Hinweis samt Aktion', () => {
    render(
      <ErrorBoundary {...TEXTE}>
        <Kaputt />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(TEXTE.titel)).toBeTruthy()
    expect(screen.getByText(TEXTE.text)).toBeTruthy()
    expect(screen.getByRole('button', { name: TEXTE.aktion })).toBeTruthy()
  })

  it('lässt die Geschwister außerhalb der Boundary stehen', () => {
    // Der eigentliche Zweck: das kaputte Overlay verschwindet, die App bleibt.
    render(
      <div>
        <p>App bleibt</p>
        <ErrorBoundary {...TEXTE}>
          <Kaputt />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByText('App bleibt')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('startet mit neuem key frisch (Screenwechsel nach einem Fehler)', () => {
    const { rerender } = render(
      <ErrorBoundary key="a" {...TEXTE}>
        <Kaputt />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    rerender(
      <ErrorBoundary key="b" {...TEXTE}>
        <p>Neuer Screen</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Neuer Screen')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * **Der Knopf im Auffangbereich.** Er ist die einzige Handlung, die dem Nutzer
 * dort bleibt — und die einzige Stelle im Projekt, an der die App sich selbst
 * neu lädt. Bliebe er wirkungslos, stünde man vor einem Kasten mit einer
 * Schaltfläche, die nichts tut.
 */
describe('ErrorBoundary — die angebotene Handlung', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('„Neu laden" lädt die Seite wirklich neu', () => {
    const reload = vi.fn()
    const echt = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...echt, reload, pathname: '/', search: '', hash: '' },
    })
    render(
      <ErrorBoundary {...TEXTE}>
        <Kaputt />
      </ErrorBoundary>,
    )
    screen.getByText(TEXTE.aktion).click()
    expect(reload).toHaveBeenCalled()
    Object.defineProperty(window, 'location', { configurable: true, value: echt })
  })

  it('der Kasten meldet sich als Warnung — auch für Screenreader', () => {
    const { container } = render(
      <ErrorBoundary {...TEXTE}>
        <Kaputt />
      </ErrorBoundary>,
    )
    expect(container.querySelector('.err-box')?.getAttribute('role')).toBe('alert')
  })
})
