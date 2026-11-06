/** @vitest-environment jsdom */
// jsdom statt happy-dom: Hier zählt der echte Verlauf — sein `popstate` kommt wie im Browser erst nach `history.back()` (tests/dom-umgebung.ts).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { ausklingen, beiRueckschritt } from '../../tests/verlauf'
import { useBackDismiss } from './useBackDismiss'

/**
 * **Die Buchführung über die eigenen Einträge** (`useBackDismiss`): was
 * abzuräumen ist, was unterwegs ist, was nachzutragen ist, und welche Ebene ein
 * Druck schon getroffen hat. Jede Probe hier trifft eine dieser Stellen, die
 * die übrigen Zurück-Proben nicht fangen.
 *
 * Gemessen am Verlauf selbst, wie in `zurueck-stapel.test.tsx`: Unter den
 * Ebenen liegt ein eigener Grundeintrag, und am Ende muss der Verlauf genau
 * dort stehen — ein Eintrag zu viel heißt, ein späterer Zurück-Druck verpufft.
 */

function Blatt({ onClose = () => {} }: { onClose?: () => void }) {
  useBackDismiss(true, onClose)
  return null
}

const stand = () => history.state as Record<string, unknown> | null

/** Ein eigener Grundeintrag unter den Ebenen dieser Probe. */
function grundeintrag(): string {
  const basis = `basis-${Math.random()}`
  history.pushState({ basis }, '')
  return basis
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Was zugeht, während der eigene Rückschritt unterwegs ist', () => {
  it('geht es danach — kein Eintrag bleibt liegen, und der nächste Druck schließt die Ebene darunter', async () => {
    /*
      Zwei Blätter gehen per ✕ zu, das zweite, während das `back()` des ersten
      noch unterwegs ist. Sein Eintrag geht erst, wenn jener Rückschritt
      angekommen ist: Zwei `back()` zugleich träfen dasselbe Ziel, und der
      zweite käme nie an — dann gälte der nächste echte Druck als der eigene.
    */
    const basis = grundeintrag()
    const protokoll: string[] = []
    render(<Blatt onClose={() => protokoll.push('unten')} />)
    const mitte = render(<Blatt />)
    const oben = render(<Blatt />)
    await ausklingen()

    oben.unmount() // per ✕
    await Promise.resolve() // die Mikroaufgabe hat das `back()` losgeschickt …
    mitte.unmount() // … und jetzt geht das zweite zu
    await ausklingen()
    expect(stand()?.cpOverlay, 'das untere Blatt ist offen, aber ohne Eintrag').toBe(true)

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll, 'der Zurück-Druck wurde verschluckt').toEqual(['unten'])
    expect(stand()?.basis, 'ein Eintrag blieb liegen').toBe(basis)
    expect(stand()?.cpOverlay).toBeUndefined()
  })

  it('geht eine Ebene auf und wieder zu, bekommt sie gar keinen Eintrag — auch nicht vorübergehend', async () => {
    /*
      Ihr Eintrag war nur vorgemerkt (`nachzutragen`), also ist nichts
      abzuräumen. Ein angelegter und gleich wieder genommener Eintrag sähe am
      Ende gleich aus, wäre aber ein `pushState` ohne Geste: Danach markiert
      Chromium die Einträge der Seite als überspringbar (siehe „Ohne Geste
      kein Eintrag" in `useBackDismiss`).
    */
    const basis = grundeintrag()
    const erstes = render(<Blatt />)
    await ausklingen()
    const push = vi.spyOn(history, 'pushState')
    const zurueck = vi.spyOn(history, 'back')

    erstes.unmount() // per ✕
    await Promise.resolve() // das `back()` ist unterwegs …
    render(<Blatt />).unmount() // … da geht ein Blatt auf und gleich wieder zu
    await ausklingen()

    expect(push, 'ein Eintrag für ein Blatt, das schon zu ist').not.toHaveBeenCalled()
    expect(zurueck).toHaveBeenCalledTimes(1)
    expect(stand()?.basis).toBe(basis)
  })
})

describe('Was im selben Augenblick zugeht, geht in einem Schritt', () => {
  it('Bildschirm und Unteransicht zugleich: ein `go(-2)`, nicht zwei Rückschritte nacheinander', async () => {
    /*
      Abgeräumt wird in einer Mikroaufgabe — nach allen Effekten desselben
      Augenblicks. Jeder Rückschritt mehr ist ein `popstate` mehr, in das ein
      Druck des Nutzers fallen kann.
    */
    const basis = grundeintrag()
    let schliessen = () => {}
    function Unteransicht() {
      useBackDismiss(true, () => {}, 'unteransicht')
      return null
    }
    function Bildschirm() {
      const [offen, setOffen] = useState(true)
      schliessen = () => setOffen(false)
      useBackDismiss(offen, () => {}, 'bildschirm')
      return offen ? <Unteransicht /> : null
    }
    render(<Bildschirm />)
    await ausklingen()
    const zurueck = vi.spyOn(history, 'back')
    const gehen = vi.spyOn(history, 'go')

    act(() => schliessen()) // zu Start: beide gehen im selben Augenblick
    await ausklingen()

    expect(zurueck).not.toHaveBeenCalled()
    expect(gehen.mock.calls).toEqual([[-2]])
    expect(stand()?.basis).toBe(basis)
  })
})

describe('Zwei Drücke, bevor die obere Ebene fort ist', () => {
  it('schließen zwei Ebenen — nicht zweimal dieselbe', () => {
    /*
      Das obere Blatt ist geschlossen, aber noch nicht abgebaut — React räumt
      erst nach dem nächsten Zeichnen auf. Ein zweiter Druck in dieser Zeit
      meint das Blatt darunter. Synthetisch: Zwei echte `back()` im selben
      Augenblick träfen in jsdom dasselbe Ziel.
    */
    const protokoll: string[] = []
    render(<Blatt onClose={() => protokoll.push('unten')} />)
    render(<Blatt onClose={() => protokoll.push('oben')} />)

    window.dispatchEvent(new PopStateEvent('popstate'))
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(protokoll).toEqual(['oben', 'unten'])
  })
})
