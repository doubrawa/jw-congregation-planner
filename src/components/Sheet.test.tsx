/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict } from '../i18n/ui'
import { Sheet } from './Sheet'

/**
 * **Ein Blatt verlässt beim Schließen erst das Feld, in dem getippt wird**
 * (13.10.2026). Felder, die beim Verlassen übernehmen — der Titel eines
 * Programmpunkts —, bekämen sonst nichts mit: Escape, die Zurück-Taste und das
 * Herunterwischen schließen, während der Fokus noch im Feld steht, und das Feld
 * verschwände samt Eingabe.
 */

const t = dict('de')

// Das Blatt lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

function zeige() {
  const onClose = vi.fn()
  const onBlur = vi.fn()
  const state = demoZustand()
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Sheet label="Probe" title="Probe" onClose={onClose}>
              <input aria-label="Feld" onBlur={onBlur} />
            </Sheet>
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const r = render(<Buehne />)
  const feld = r.getByLabelText('Feld')
  feld.focus()
  return { onClose, onBlur, feld, container: r.container }
}

afterEach(cleanup)

describe('Schließen verlässt zuerst das Feld', () => {
  it.each([
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['das Kreuz', () => fireEvent.click(document.querySelector(`[aria-label="${t.a11yClose}"]`)!)],
    ['der Schleier', () => fireEvent.click(document.querySelector('.sheet-backdrop')!)],
  ])('%s', (_weg, schliessen) => {
    const { onClose, onBlur } = zeige()
    schliessen()
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onBlur.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]!)
  })

  it('steht der Fokus außerhalb des Blatts, bleibt er dort', () => {
    const { onClose, feld } = zeige()
    const draussen = document.createElement('button')
    document.body.append(draussen)
    draussen.focus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(draussen)
    expect(document.activeElement).not.toBe(feld)
    draussen.remove()
  })
})
