/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { useBackDismiss } from './useBackDismiss'

/**
 * **Zwei Ebenen übereinander, die sich wirklich schließen** — mit dem echten
 * Verlauf von jsdom, nicht mit einem synthetischen Ereignis.
 *
 * `zurueck-oberstes.test.tsx` prüft, dass ein `popstate` nur das oberste Blatt
 * schließt; dort bleibt der Verlauf stehen, und kein Blatt verschwindet
 * wirklich. Hier schließt sich das obere, wie in der App, über seinen Zustand —
 * und danach muss das untere **seinen Eintrag noch haben**. Fehlt er, verlässt
 * der nächste Zurück-Druck die App, obwohl das untere Blatt noch offen ist.
 *
 * Gemessen am Verlauf selbst: Unter den Ebenen liegt ein eigener Grundeintrag.
 * In jsdom gehört jeder ältere Eintrag zum selben Dokument und löst wieder ein
 * `popstate` aus — „die App verlassen" sieht man dort nur daran, wo der Verlauf
 * danach steht.
 */

function Blatt({ onClose }: { onClose: () => void }) {
  useBackDismiss(true, onClose)
  return null
}

/** Zwei Blätter; jedes verschwindet, sobald es geschlossen wird — wie in der App. */
function Stapel({ protokoll }: { protokoll: string[] }) {
  const [unten, setUnten] = useState(true)
  const [oben, setOben] = useState(true)
  return (
    <>
      {unten && (
        <Blatt
          onClose={() => {
            protokoll.push('unten')
            setUnten(false)
          }}
        />
      )}
      {oben && (
        <Blatt
          onClose={() => {
            protokoll.push('oben')
            setOben(false)
          }}
        />
      )}
    </>
  )
}

/** `ausloesen()` anstoßen und auf das daraus folgende `popstate` warten (ohne feste Frist). */
function beiRueckschritt(ausloesen: () => void): Promise<void> {
  return new Promise<void>((fertig) => {
    window.addEventListener('popstate', () => fertig(), { once: true })
    ausloesen()
  })
}

/** Ein paar Durchläufe weiter: Ein eigenes Aufräumen samt seinem `popstate` ist dann durch. */
async function ausklingen(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((fertig) => setTimeout(fertig, 0))
}

afterEach(cleanup)

describe('Zwei Ebenen übereinander schließen sich der Reihe nach', () => {
  it('Zurück schließt das obere — das untere behält seinen Eintrag, der nächste Zurück schließt es', async () => {
    const basis = `basis-${Math.random()}`
    history.pushState({ basis }, '')
    const protokoll: string[] = []
    render(<Stapel protokoll={protokoll} />)

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll).toEqual(['oben'])
    // Das untere Blatt ist offen — also muss sein Eintrag noch obenauf liegen.
    expect((history.state as Record<string, unknown> | null)?.basis, 'unten offen, aber sein Eintrag ist weg').toBe(basis)
    expect((history.state as Record<string, unknown> | null)?.cpOverlay, 'unten offen, aber sein Eintrag ist weg').toBe(true)

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll).toEqual(['oben', 'unten'])
    // Und danach steht der Verlauf wieder auf dem Grundeintrag, nicht davor.
    expect((history.state as Record<string, unknown> | null)?.basis).toBe(basis)
    expect((history.state as Record<string, unknown> | null)?.cpOverlay).toBeUndefined()
  })

  it('gehen ein Bildschirm und seine Unteransicht zugleich auf, schließt Zurück zuerst die Unteransicht', async () => {
    /*
      React hängt Kinder vor Eltern ein: Die Unteransicht (Kind) legt ihren
      Eintrag vor dem Bildschirm (Eltern) an und wäre nach der Reihenfolge die
      untere. Es zählt der Rang der Ebene.
    */
    const basis = `basis-${Math.random()}`
    history.pushState({ basis }, '')
    const protokoll: string[] = []

    function Unteransicht() {
      const [offen, setOffen] = useState(true)
      useBackDismiss(offen, () => {
        protokoll.push('unteransicht')
        setOffen(false)
      }, 'unteransicht')
      return null
    }
    function Bildschirm() {
      const [offen, setOffen] = useState(true)
      useBackDismiss(offen, () => {
        protokoll.push('bildschirm')
        setOffen(false)
      }, 'bildschirm')
      return <Unteransicht />
    }
    render(<Bildschirm />)

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll).toEqual(['unteransicht'])

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll).toEqual(['unteransicht', 'bildschirm'])
    expect((history.state as Record<string, unknown> | null)?.basis).toBe(basis)
    expect((history.state as Record<string, unknown> | null)?.cpOverlay).toBeUndefined()
  })

  it('geht eine Ebene zu und im selben Augenblick eine andere auf, bleibt ein Eintrag — und der nächste Druck wirkt', async () => {
    // Das Handy-Menü schließt, der gewählte Bildschirm öffnet. Bis zum
    // 4.10.2026 brach das `pushState` des Bildschirms das `back()` des Menüs ab,
    // und dessen Ankündigung verschluckte den nächsten Druck.
    const basis = `basis-${Math.random()}`
    history.pushState({ basis }, '')
    const protokoll: string[] = []

    function Wechsel() {
      const [menue, setMenue] = useState(true)
      useBackDismiss(menue, () => setMenue(false))
      useBackDismiss(!menue, () => protokoll.push('bildschirm'), 'bildschirm')
      return (
        <button type="button" onClick={() => setMenue(false)}>
          wählen
        </button>
      )
    }
    const { getByText } = render(<Wechsel />)
    await ausklingen()
    getByText('wählen').click()
    await ausklingen()
    expect((history.state as Record<string, unknown> | null)?.cpOverlay, 'kein Eintrag für den Bildschirm').toBe(true)

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll, 'der Zurück-Druck wurde verschluckt').toEqual(['bildschirm'])
    expect((history.state as Record<string, unknown> | null)?.basis).toBe(basis)
    expect((history.state as Record<string, unknown> | null)?.cpOverlay).toBeUndefined()
  })

  it('geht eine Ebene auf, während der Rückschritt einer geschlossenen noch unterwegs ist, kommt ihr Eintrag danach', async () => {
    /*
      Ein späterer Augenblick als oben: Das Blatt ist per ✕ zu, sein `back()`
      ist schon losgeschickt, und erst dann geht das nächste auf. Legte es
      seinen Eintrag sofort an, bräche das den Rückschritt ab — sein `popstate`
      käme nie, und der nächste echte Druck gälte als der eigene.
    */
    const basis = `basis-${Math.random()}`
    history.pushState({ basis }, '')
    const protokoll: string[] = []

    const erstes = render(<Blatt onClose={() => protokoll.push('erstes')} />)
    await ausklingen()
    erstes.unmount() // per ✕ geschlossen
    await Promise.resolve() // die Mikroaufgabe hat das `back()` losgeschickt …
    render(<Blatt onClose={() => protokoll.push('zweites')} />) // … und jetzt geht das nächste auf
    await ausklingen()
    expect((history.state as Record<string, unknown> | null)?.cpOverlay, 'kein Eintrag für das zweite Blatt').toBe(true)

    await beiRueckschritt(() => history.back())
    await ausklingen()
    expect(protokoll, 'der Zurück-Druck wurde verschluckt').toEqual(['zweites'])
    expect((history.state as Record<string, unknown> | null)?.basis).toBe(basis)
    expect((history.state as Record<string, unknown> | null)?.cpOverlay).toBeUndefined()
  })
})
