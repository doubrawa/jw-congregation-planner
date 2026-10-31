/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useApp, useAppDispatch } from '../app/context'
import { AppProvider } from '../app/store'
import { useT } from './useT'

afterEach(cleanup)

/**
 * **Die Bibelbücher kommen nach dem ersten Zeichnen** (15.10.2026).
 *
 * Ihre Tabellen liegen in einem nachgeladenen Modul, und `makeTr` stellt seine
 * Regeln beim Erzeugen zusammen. Nach dem Laden stößt `store.tsx` ein
 * Neuzeichnen an, wie bei den Sprach-Overlays — nur behielt `useT` seinen
 * Übersetzer, solange Sprache und Overlay dieselben blieben. Die Buchnamen
 * standen dann deutsch da, bis der Baustein neu aufgebaut wurde: nach jedem
 * Sprachwechsel, nach einem Start aus der Momentaufnahme.
 *
 * Eine eigene Datei, weil die Tabellen, einmal geladen, für alle weiteren
 * Tests derselben Datei geladen bleiben — hier dürfen sie es vorher nicht sein.
 */
describe('Nach dem Nachladen der Bibelbücher', () => {
  /** Wie jeder Bildschirm: liest den Zustand (zeichnet also bei jeder Änderung neu) und übersetzt. */
  function Buch() {
    useApp()
    const { tu } = useT()
    return <span data-testid="buch">{tu('Jeremia 32')}</span>
  }

  function Englisch() {
    const dispatch = useAppDispatch()
    return (
      <button type="button" onClick={() => dispatch({ type: 'setLang', lang: 'en' })}>
        englisch
      </button>
    )
  }

  it('steht der Buchname in der Sprache des Lesers — ohne dass der Baustein neu entsteht', async () => {
    const { getByTestId, getByText } = render(
      <AppProvider>
        <Buch />
        <Englisch />
      </AppProvider>,
    )
    // Der Wechsel baut den Übersetzer sofort — da sind die Tabellen noch
    // unterwegs, und er kennt keine Bücher.
    fireEvent.click(getByText('englisch'))
    expect(getByTestId('buch').textContent).toBe('Jeremia 32')
    await waitFor(() => expect(getByTestId('buch').textContent).toBe('Jeremiah 32'))
  })
})
