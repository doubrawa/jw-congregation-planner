/** @vitest-environment jsdom */
// jsdom statt happy-dom: Hier zählt der echte Verlauf — sein `popstate` kommt wie im Browser erst nach `history.back()` (tests/dom-umgebung.ts).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { beiRueckschritt } from '../../tests/verlauf'
import { useBackDismiss } from './useBackDismiss'

/**
 * **Ein geschlossenes Blatt darf den nächsten Zurück-Druck nicht verschlucken.**
 *
 * `useBackDismiss` kündigt sein eigenes `history.back()` an, damit ein noch
 * offenes Blatt das daraus folgende `popstate` nicht für einen Zurück-Druck des
 * Nutzers hält. Die Ankündigung war ein Zähler, den nur ein *anderes* Blatt
 * wieder herunterzog — und im Normalfall gibt es keines: Wer das einzige offene
 * Blatt per ✕ schließt, lässt den Zähler stehen.
 *
 * Die Folge stand danach beim **nächsten** Blatt: Der erste Zurück-Druck wurde
 * als eigenes Aufräumen abgetan, das Blatt blieb liegen, sein Verlaufseintrag
 * war aber weg — und der zweite Druck verließ die App. Auf dem Handy ist Zurück
 * die meistgenutzte Geste überhaupt, und mit jedem ✕ wuchs der Zähler weiter.
 *
 * Gemessen wird mit dem **echten** Verlauf von jsdom, nicht mit einem
 * synthetischen Ereignis: Nur so entsteht das `popstate`, um das es geht.
 */

function Blatt({ onClose }: { onClose: () => void }) {
  useBackDismiss(true, onClose)
  return <div />
}

/**
 * Einen Durchlauf weiter — dann ist die Frist gelaufen, mit der die Ankündigung
 * verfällt.
 *
 * Auch das ohne Uhr: Jene Frist wird **während** der Ereignisverteilung
 * gesetzt, diese danach. Gleiche Dauer heißt gleiche Reihenfolge, also ist die
 * andere zuerst dran.
 */
const naechsterDurchlauf = (): Promise<void> =>
  new Promise<void>((fertig) => setTimeout(fertig, 0))

afterEach(cleanup)

describe('Die Ankündigung des eigenen Zurück verfällt', () => {
  it('nach einem per ✕ geschlossenen Blatt wirkt Zurück wieder', async () => {
    let ersteZu = 0
    const erstes = render(<Blatt onClose={() => ersteZu++} />)
    await beiRueckschritt(() => erstes.unmount()) // wie ein Klick auf ✕
    await naechsterDurchlauf()

    let zweiteZu = 0
    render(<Blatt onClose={() => zweiteZu++} />)
    await beiRueckschritt(() => history.back()) // echter Zurück-Druck

    expect(zweiteZu, 'der Zurück-Druck wurde verschluckt').toBe(1)
    expect(ersteZu, 'das längst geschlossene Blatt hat mitgehört').toBe(0)
  })

  it('auch nach mehreren geschlossenen Blättern', async () => {
    // Der Zähler wuchs mit jedem ✕ — nach dreien wären drei Zurück-Drücke
    // verschluckt worden.
    for (let i = 0; i < 3; i++) {
      const r = render(<Blatt onClose={() => {}} />)
      await beiRueckschritt(() => r.unmount())
      await naechsterDurchlauf()
    }

    let zu = 0
    render(<Blatt onClose={() => zu++} />)
    await beiRueckschritt(() => history.back())

    expect(zu).toBe(1)
  })

  it('das Blatt darunter hält das eigene Aufräumen weiterhin aus', async () => {
    /*
      Gegenprobe zur Reparatur: Die Ankündigung darf nicht einfach wegfallen.
      Liegen zwei Blätter übereinander und das obere schließt per ✕, erreicht
      dessen `history.back()` das untere — das darf sich davon nicht schließen
      lassen.
    */
    let untenZu = 0
    render(<Blatt onClose={() => untenZu++} />)
    const oben = render(<Blatt onClose={() => {}} />)
    await beiRueckschritt(() => oben.unmount())
    await naechsterDurchlauf()

    expect(untenZu, 'das untere Blatt ging mit zu').toBe(0)

    // …und ein echter Zurück-Druck schließt es danach sehr wohl.
    await beiRueckschritt(() => history.back())
    expect(untenZu).toBe(1)
  })
})
