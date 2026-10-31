/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { ErsteSchritteFilm } from './ErsteSchritteFilm'

/**
 * **Zurück schließt den Film, nicht die App** (22.10.2026).
 *
 * Am Handy ist Zurück die meistgenutzte Geste. Der Film füllt dort den ganzen
 * Schirm; verließe Zurück die App, wäre er der einzige Weg hinaus, der nicht
 * dahin führt, wo man herkam. Er trägt sich deshalb wie ein Blatt in den
 * Verlauf ein (`useBackDismiss`).
 *
 * **Eine eigene Datei**, weil `useBackDismiss` seinen Stapel modulweit führt:
 * Der Rückschritt soll auf genau diesen Film treffen, nicht auf Reste anderer
 * Proben derselben Datei (siehe `zurueck-oberstes.test.tsx`).
 */

window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

afterEach(cleanup)

function Buehne({ onClose }: { onClose: () => void }) {
  const state = demoZustand()
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <ErsteSchritteFilm onClose={onClose} />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

describe('Zurück', () => {
  it('schließt den Film', () => {
    const onClose = vi.fn()
    render(<Buehne onClose={onClose} />)
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
