/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import type { Person } from '../data/types'
import type { Ausgestellt } from '../lib/links-ausstellen'
import { dict } from '../i18n/ui'

/**
 * **Der Zettel-Druck räumt hinter sich auf — auch neben einem zweiten.**
 *
 * Am Desktop stehen die Konto-Karte und „Links senden" nebeneinander, beide mit
 * `useZettelDruck`. Bis zum 15.10.2026 fragten beide nach dem Druck nur das
 * Kennzeichen am Wurzelelement: Die erste, die drankam, nahm es weg, und die
 * andere — die gedruckt hatte — fand es nicht mehr und ließ ihren Bogen samt
 * Codes im DOM stehen.
 */

const linksAusstellen = vi.fn((ids: readonly string[]) =>
  Promise.resolve<Ausgestellt>({
    links: ids.map((personId) => ({
      personId,
      url: 'https://versammlung.app/#anmelden=x',
      zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
      code: 'K7RD 2QWM',
      gueltigBis: '2026-11-14T09:00:00.000Z',
    })),
    fehler: false,
  }),
)
vi.mock('../lib/links-ausstellen', async (echt) => ({
  ...(await echt<typeof import('../lib/links-ausstellen')>()),
  linksAusstellen: (ids: readonly string[]) => linksAusstellen(ids),
}))
// Das Wörterbuch der Versammlung kommt nachgeladen — `kaputt`: nach einem Deploy fehlt der alte Teil.
const nachladen = { kaputt: false }
vi.mock('../i18n/ui', async (echt) => {
  const ui = await echt<typeof import('../i18n/ui')>()
  return {
    ...ui,
    loadOverlay: (lang: Parameters<typeof ui.loadOverlay>[0]) =>
      nachladen.kaputt ? Promise.reject(new Error('Failed to fetch dynamically imported module')) : ui.loadOverlay(lang),
  }
})
const dispatch = vi.fn()

const { useZettelDruck } = await import('./useZettelDruck')

const ANTON: Person = { id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false, priv: emptyQualifications() }

/** Eine Stelle mit dem Hook — mit Knopf zum Drucken, wenn `knopf` gesetzt ist. */
function Stelle({ knopf }: { knopf?: string }) {
  const druck = useZettelDruck()
  return (
    <>
      {knopf && (
        <button type="button" onClick={() => void druck.drucken([ANTON])}>
          {knopf}
        </button>
      )}
      {druck.bogen}
    </>
  )
}

function zeige() {
  const state: AppState = { ...demoZustand(), dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true, persons: [ANTON] }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {/* Die erste Stelle druckt nie — sie hört aber als erste auf „afterprint". */}
            <Stelle />
            <Stelle knopf="drucken" />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

beforeEach(() => {
  window.print = vi.fn()
  linksAusstellen.mockClear()
  dispatch.mockClear()
  nachladen.kaputt = false
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.print
})

describe('Zettel drucken neben einer zweiten Stelle', () => {
  it('nach dem Druckdialog ist der Bogen fort — auch wenn eine andere Stelle zuerst auf „afterprint" hört', async () => {
    const { getByText } = zeige()
    fireEvent.click(getByText('drucken'))
    await waitFor(() => expect(window.print).toHaveBeenCalled())
    expect(document.querySelectorAll('.anmelde-bogen')).toHaveLength(1)
    await act(async () => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.querySelector('.anmelde-bogen')).toBeNull()
    expect(document.documentElement.dataset.print).toBeUndefined()
  })

  it('verschwindet die Stelle beim Warten, wird nicht gedruckt — und kein Kennzeichen bleibt stehen (16.10.2026)', async () => {
    // Bis dahin kam der Druckdialog ohne Bogen, und `data-print` blieb am
    // Wurzelelement: Jeder spätere Druck blieb leer.
    let freigeben: () => void = () => {}
    linksAusstellen.mockImplementationOnce(
      (ids) =>
        new Promise<Ausgestellt>((fertig) => {
          freigeben = () =>
            fertig({
              links: ids.map((personId) => ({
                personId,
                url: 'https://versammlung.app/#anmelden=x',
                zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
                code: 'K7RD 2QWM',
                gueltigBis: '2026-11-14T09:00:00.000Z',
              })),
              fehler: false,
            })
        }),
    )
    const { getByText, unmount } = zeige()
    fireEvent.click(getByText('drucken'))
    await waitFor(() => expect(linksAusstellen).toHaveBeenCalled())
    unmount()
    await act(async () => {
      freigeben()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(window.print).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.print).toBeUndefined()
  })

  /*
   * Ein neuer Link ersetzt den alten samt Zettel. Stellte der Druck erst aus
   * und lüde dann nach, wären beim Fehlen des Teils die Links ersetzt, gedruckt
   * wäre nichts, und es käme keine Meldung.
   */
  it('lässt sich nicht nachladen, was der Druck braucht, wird kein Link ersetzt — und es steht da', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      nachladen.kaputt = true
      const { getByText } = zeige()
      fireEvent.click(getByText('drucken'))
      await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: dict('de').linkFehler }))
      expect(linksAusstellen).not.toHaveBeenCalled()
      expect(window.print).not.toHaveBeenCalled()
    } finally {
      fehler.mockRestore()
    }
  })

  it('Gegenprobe: lädt es, wird ausgestellt und gedruckt', async () => {
    const { getByText } = zeige()
    fireEvent.click(getByText('drucken'))
    await waitFor(() => expect(window.print).toHaveBeenCalled())
    expect(linksAusstellen).toHaveBeenCalledWith(['p-a'])
  })

  it('der Druck einer anderen Seite (S-89) lässt sie in Ruhe', async () => {
    zeige()
    document.documentElement.dataset.print = 's89'
    await act(async () => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.documentElement.dataset.print).toBe('s89')
  })
})
