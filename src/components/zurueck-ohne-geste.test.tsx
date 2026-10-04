/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { useBackDismiss, type Ebene } from './useBackDismiss'
import {
  WaechterAttrappe,
  attrappenEinsetzen,
  attrappenEntfernen,
  mitGeste,
  zurueckTaste,
} from '../../tests/zurueck-attrappen'

/**
 * **Ohne Geste kein Eintrag, sondern ein Wächter** (4.10.2026).
 *
 * Chromium markiert alle Einträge eines Dokuments als überspringbar, sobald es
 * ohne Geste `pushState` ruft; die Zurück-Taste springt dann darüber hinweg,
 * und auf Android schließt die App. So öffnete ein Push-Tipp die App: Der
 * Bildschirm aus `#go=…` ging ohne Geste auf, und der erste Zurück-Druck führte
 * nicht zu Start, sondern hinaus (gemessen im Produktions-Build).
 *
 * jsdom kennt diesen Schutz nicht und springt nie. Geprüft wird deshalb, was
 * die Regel verlangt: ohne Geste **kein** Eintrag, dafür ein Wächter — und mit
 * der nächsten Ebene, die mit Geste aufgeht, der nachgetragene Eintrag.
 * `CloseWatcher` und `navigator.userActivation` stellt
 * `tests/zurueck-attrappen.ts`.
 *
 * Wie in `zurueck-stapel.test.tsx` liegt unter allem ein eigener Grundeintrag:
 * Ein Rückschritt, der nicht hätte sein dürfen, zeigt sich daran, dass der
 * Verlauf nicht mehr auf ihm steht.
 */

let basis = ''
const zustand = () => (history.state ?? {}) as Record<string, unknown>
/** Steht der Verlauf auf dem Grundeintrag — kein Eintrag darüber, keiner zu wenig? */
const amGrund = () => zustand().basis === basis && zustand().cpOverlay === undefined

/** Ein paar Durchläufe weiter: Effekte, eigenes Aufräumen und dessen `popstate` sind dann durch. */
async function ausklingen(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((fertig) => setTimeout(fertig, 0))
}

/** Eine Ebene, die verschwindet, sobald sie geschlossen wird — wie in der App. */
function Probe({ name, ebene = 'blatt', protokoll }: { name: string; ebene?: Ebene; protokoll: string[] }) {
  const [offen, setOffen] = useState(true)
  useBackDismiss(
    offen,
    () => {
      protokoll.push(name)
      setOffen(false)
    },
    ebene,
  )
  return offen ? (
    <button type="button" onClick={() => setOffen(false)}>
      {name} schließen
    </button>
  ) : null
}

beforeEach(() => {
  attrappenEinsetzen()
  basis = `basis-${Math.random()}`
  history.pushState({ basis }, '')
})

afterEach(async () => {
  cleanup()
  await ausklingen() // eigenes Aufräumen nicht in den nächsten Test tragen
  attrappenEntfernen()
})

describe('Eine Ebene ohne Geste', () => {
  it('legt keinen Eintrag an — die Zurück-Taste schließt sie über ihren Wächter', async () => {
    const protokoll: string[] = []
    render(<Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />)
    await ausklingen()
    expect(amGrund(), 'ohne Geste entstand ein Eintrag — Chromium überspränge ihn').toBe(true)
    expect(WaechterAttrappe.aufgestellt).toHaveLength(1)

    expect(await zurueckTaste()).toBe('waechter')
    await ausklingen()
    expect(protokoll).toEqual(['bildschirm'])
    expect(WaechterAttrappe.aufgestellt).toHaveLength(0)
    expect(amGrund(), 'der Verlauf hat sich bewegt').toBe(true)
  })

  it('bekommt ihren Eintrag, sobald eine Ebene mit Geste aufgeht — vor deren eigenem', async () => {
    const protokoll: string[] = []
    render(<Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />)
    await ausklingen()
    await mitGeste(() => render(<Probe name="blatt" protokoll={protokoll} />))
    expect(WaechterAttrappe.aufgestellt, 'der Wächter blieb — die Taste träfe zuerst die untere Ebene').toHaveLength(0)

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(protokoll).toEqual(['blatt'])
    expect(zustand().cpOverlay, 'der Bildschirm hat seinen Eintrag nicht bekommen').toBe(true)

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(protokoll).toEqual(['blatt', 'bildschirm'])
    expect(amGrund()).toBe(true)
  })

  it('anders geschlossen, geht nur ihr Wächter — kein Rückschritt', async () => {
    const protokoll: string[] = []
    const { getByText } = render(<Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />)
    await ausklingen()
    const laenge = history.length

    await mitGeste(() => fireEvent.click(getByText('bildschirm schließen')))
    expect(WaechterAttrappe.aufgestellt, 'der Wächter blieb — der nächste Druck träfe eine geschlossene Ebene').toHaveLength(0)
    expect(amGrund(), 'ein Rückschritt ohne Eintrag ginge aus der App hinaus').toBe(true)
    expect(history.length).toBe(laenge)
  })

  it('über einer Ebene mit Eintrag bekommt sie auch einen Eintrag — ein Wächter träfe zuerst sie', async () => {
    // Ein Blatt ist offen, und der Bildschirm wechselt ohne Geste (ein
    // Push-Tipp ins offene Fenster). Chromium bedient Wächter vor dem Verlauf:
    // Der Bildschirm ginge zu, das Blatt mit dem höheren Rang bliebe stehen.
    const protokoll: string[] = []
    await mitGeste(() => render(<Probe name="blatt" protokoll={protokoll} />))
    render(<Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />)
    await ausklingen()
    expect(WaechterAttrappe.aufgestellt).toHaveLength(0)

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(protokoll, 'die Taste traf die untere Ebene').toEqual(['blatt'])

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(protokoll).toEqual(['blatt', 'bildschirm'])
    expect(amGrund()).toBe(true)
  })

  it('zwei zugleich ohne Geste: beide mit Wächter, ein Druck schließt beide', async () => {
    // Bildschirm und Unteransicht auf einmal — etwa die Entwicklerseite mit
    // `#s=personen&p=…`. Chromium bündelt Wächter ohne Geste zu einer Gruppe;
    // bekäme die zweite einen Eintrag, stünde der Wächter der ersten darunter
    // und schlösse vor ihm.
    const protokoll: string[] = []
    function Bildschirm() {
      return (
        <>
          <Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />
          <Probe name="unteransicht" ebene="unteransicht" protokoll={protokoll} />
        </>
      )
    }
    render(<Bildschirm />)
    await ausklingen()
    expect(amGrund()).toBe(true)
    expect(WaechterAttrappe.aufgestellt).toHaveLength(2)

    expect(await zurueckTaste()).toBe('waechter')
    await ausklingen()
    expect([...protokoll].sort()).toEqual(['bildschirm', 'unteransicht'])
    expect(amGrund()).toBe(true)
  })

  it('ohne `CloseWatcher` (Firefox, Safari) bleibt es beim Eintrag', async () => {
    attrappenEinsetzen({ ohneWaechter: true })
    const protokoll: string[] = []
    render(<Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />)
    await ausklingen()
    expect(zustand().cpOverlay, 'kein Eintrag — und kein Wächter, der einspränge').toBe(true)

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(protokoll).toEqual(['bildschirm'])
    expect(amGrund()).toBe(true)
  })
})

describe('Eine Ebene mit Geste', () => {
  it('legt ihren Eintrag an wie bisher — kein Wächter', async () => {
    const protokoll: string[] = []
    await mitGeste(() => render(<Probe name="bildschirm" ebene="bildschirm" protokoll={protokoll} />))
    expect(WaechterAttrappe.aufgestellt).toHaveLength(0)
    expect(zustand().cpOverlay).toBe(true)

    expect(await zurueckTaste()).toBe('verlauf')
    await ausklingen()
    expect(protokoll).toEqual(['bildschirm'])
    expect(amGrund()).toBe(true)
  })
})
