/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { LABEL_LAC } from '../data/constants'
import { LAC_MAX_MINUTEN, LAC_MIN_MINUTEN } from '../data/meeting-edit'
import type { PartItem, Section, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { ProgrammBlatt } from './ProgrammBlatt'

/**
 * **Das Programm bearbeiten** (T121, Phase 5b) — Minuten, Reihenfolge,
 * Entfernen und eigene Punkte unter „Unser Leben als Christ".
 *
 * Bis Phase 5b standen diese Regeln an der Steuerung mitten im Plan
 * (`MeetingSection.test.tsx`); seitdem gelten sie im Blatt hinter „Woche
 * einrichten". Sie sind dieselben geblieben: Die Minuten werden getippt, nicht
 * erklickt, und gelten beim Verlassen; am Rand ist das Verschieben gesperrt;
 * Löschen fragt nach; ein neuer Punkt braucht einen Titel.
 */

const t = dict('de')

// jsdom kennt kein matchMedia; das Blatt fragt danach (Wischgeste nur mobil).
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const schaetze = (): Section => ({
  label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
  items: [{ iid: 'i1', num: 1, title: 'Schätze', meta: '10 Min.', mins: 10, names: [{ name: '' }] }],
})

const lac = (): Section => ({
  label: LABEL_LAC, farbe: 'wein',
  items: [
    { iid: 'i89', num: 8, title: 'Örtliche Hinweise', meta: '5 Min.', mins: 5, names: [{ name: '' }] },
    {
      iid: 'i88', num: 9, title: 'Versammlungsbibelstudium', meta: '30 Min.', mins: 30,
      names: [{ name: '', rolle: 'Leiter' }, { name: '', rolle: 'Leser', bereichsKey: 'leser' }],
    },
  ],
})

/** Der Abschnitt „Unser Leben als Christ" steht an zweiter Stelle. */
const LAC = 1

function woche(sections: Section[] = [schaetze(), lac()]): Week {
  return {
    range: '7.–13. September', book: 'JEREMIA 32', start: '2026-09-07',
    mid: { date: '', end: 'Ende ca. 20:45', sections, helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

function Buehne({ state, dispatch, onClose }: { state: AppState; dispatch: () => void; onClose: () => void }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <ProgrammBlatt onClose={onClose} />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

function zeige(weeks: Week[] = [woche()]) {
  const dispatch = vi.fn()
  const onClose = vi.fn()
  const state = (w: Week[]): AppState => ({
    ...demoZustand(), dataStatus: 'ready', screen: 'planen', tab: 'edit', planner: true, weeks: w, week: 0,
  })
  const r = render(<Buehne state={state(weeks)} dispatch={dispatch} onClose={onClose} />)
  const neuZeichnen = (w: Week[]) => r.rerender(<Buehne state={state(w)} dispatch={dispatch} onClose={onClose} />)
  return { dispatch, onClose, neuZeichnen }
}

/** Die Blätter von unten nach oben — das Programm, darüber ein Punkt. */
const blaetter = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
const oben = () => blaetter().at(-1)!

/** Den Punkt mit diesem Titel im Programm antippen — sein Blatt geht darüber auf. */
const oeffne = (titel: string) => {
  const zeile = [...document.querySelectorAll<HTMLButtonElement>('.programm-zeile.is-bearbeitbar')].find((z) =>
    z.textContent?.includes(titel),
  )!
  fireEvent.click(zeile)
}

const knopf = (c: ParentNode, text: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

afterEach(cleanup)

describe('Das Programm der Woche', () => {
  it('zeigt jeden Abschnitt — bearbeiten lässt sich nur „Unser Leben als Christ"', () => {
    zeige()
    expect(oben().getAttribute('aria-label')).toBe(t.programmTitel)
    const zeilen = [...document.querySelectorAll('.programm-zeile')]
    expect(zeilen.map((z) => z.classList.contains('is-bearbeitbar'))).toEqual([false, true, true])
    // Was aus dem Arbeitsheft kommt, sagt es von sich.
    const koepfe = [...document.querySelectorAll('.prog-abschnitt-kopf .prog-lied')].map((k) => k.textContent)
    expect(koepfe[0]).toBe(t.ausArbeitsheft)
    // Einfügen gibt es nur dort, wo es eigene Punkte gibt.
    expect(document.querySelectorAll('.programm-einfuegen')).toHaveLength(1)
  })

  it('nennt den Abschnitt, in dem umgeordnet wird, beim Namen', () => {
    zeige()
    expect(oben().textContent).toContain(t.programmHinweis.replace('{abschnitt}', LABEL_LAC))
  })

  it('ohne Woche steht gar nichts da', () => {
    zeige([])
    expect(blaetter()).toHaveLength(0)
  })
})

describe('Ein Programmpunkt', () => {
  it('trägt seine Minuten in einem Feld — samt Einheit', () => {
    zeige()
    oeffne('Versammlungsbibelstudium')
    expect(blaetter()).toHaveLength(2)
    expect(oben().querySelector<HTMLInputElement>('.lac-mins-input')?.value).toBe('30')
    expect(oben().querySelector('.lac-mins-einheit')?.textContent).toBe(' Min.')
  })

  it('eine getippte Zahl gilt beim Verlassen des Feldes — jede Minute, nicht jede fünfte', () => {
    const { dispatch } = zeige()
    oeffne('Versammlungsbibelstudium')
    const feld = oben().querySelector<HTMLInputElement>('.lac-mins-input')!
    fireEvent.focus(feld)
    fireEvent.change(feld, { target: { value: '19' } })
    // Während des Tippens noch nichts: Die „1" von „19" wäre sonst ein eigener
    // Wert, würde auf 5 geklemmt und zöge die Endzeit mit.
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.blur(feld)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacMinuten', si: LAC, ii: 1, mins: 19 })
  })

  it('ein leeres Feld ändert nichts — und Escape nimmt den alten Wert zurück, ohne das Blatt zu schließen', () => {
    const { dispatch } = zeige()
    oeffne('Versammlungsbibelstudium')
    const feld = oben().querySelector<HTMLInputElement>('.lac-mins-input')!
    // Wer alles löscht und weiterklickt, wollte nicht die kürzestmögliche Dauer.
    fireEvent.focus(feld)
    fireEvent.change(feld, { target: { value: '' } })
    fireEvent.blur(feld)
    expect(dispatch).not.toHaveBeenCalled()

    fireEvent.focus(feld)
    fireEvent.change(feld, { target: { value: '42' } })
    fireEvent.keyDown(feld, { key: 'Escape' })
    fireEvent.blur(feld)
    expect(dispatch).not.toHaveBeenCalled()
    expect(oben().querySelector<HTMLInputElement>('.lac-mins-input')!.value).toBe('30')
    // Die Taste gehört dem Feld — das Blatt bleibt offen.
    expect(blaetter()).toHaveLength(2)
  })

  it('das Feld trägt die Grenzen 5..45 und zählt in Einerschritten', () => {
    zeige()
    oeffne('Örtliche Hinweise')
    const feld = oben().querySelector<HTMLInputElement>('.lac-mins-input')!
    expect(feld.min).toBe(String(LAC_MIN_MINUTEN))
    expect(feld.max).toBe(String(LAC_MAX_MINUTEN))
    expect(feld.step).toBe('1')
    expect(feld.type).toBe('number')
  })

  it('am Rand ist das Verschieben gesperrt — nach oben beim ersten, nach unten beim letzten', () => {
    zeige()
    oeffne('Örtliche Hinweise')
    expect(knopf(oben(), t.a11yMoveUp).disabled).toBe(true)
    expect(knopf(oben(), t.a11yMoveDown).disabled).toBe(false)
    cleanup()
    zeige()
    oeffne('Versammlungsbibelstudium')
    expect(knopf(oben(), t.a11yMoveUp).disabled).toBe(false)
    expect(knopf(oben(), t.a11yMoveDown).disabled).toBe(true)
  })

  it('Verschieben nennt die Richtung', () => {
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    fireEvent.click(knopf(oben(), t.a11yMoveDown))
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacMove', si: LAC, ii: 0, dir: 1 })
  })

  it('verschoben bleibt das Blatt beim selben Punkt — es sucht ihn an seiner Kennung', () => {
    const { dispatch, neuZeichnen } = zeige()
    oeffne('Örtliche Hinweise')
    // Der Punkt steht jetzt an zweiter Stelle, wie nach „Nach unten".
    const getauscht = lac()
    getauscht.items.reverse()
    neuZeichnen([woche([schaetze(), getauscht])])
    expect(oben().getAttribute('aria-label')).toBe('Örtliche Hinweise')
    fireEvent.click(knopf(oben(), t.a11yMoveUp))
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacMove', si: LAC, ii: 1, dir: -1 })
  })

  it('Entfernen fragt erst nach — danach geht der Punkt und mit ihm sein Blatt', () => {
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    const entfernen = oben().querySelector<HTMLButtonElement>('.lac-remove')!
    fireEvent.click(entfernen)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'lacRemove', si: LAC, ii: 0 })
    expect(entfernen.textContent).toBe(t.entfernenSicher)
    fireEvent.click(entfernen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacRemove', si: LAC, ii: 0 })
    expect(blaetter()).toHaveLength(1)
  })
})

describe('Ein eigener Punkt', () => {
  it('braucht einen Titel — leer bittet darum', () => {
    const { dispatch } = zeige()
    fireEvent.click(document.querySelector('.programm-einfuegen')!)
    fireEvent.click(knopf(oben(), t.uebernehmen))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameEingeben })
    expect(dispatch.mock.calls.some((c) => (c[0] as { type: string }).type === 'lacAdd')).toBe(false)
  })

  it('mit Titel wird er eingefügt, und das Blatt geht zu', () => {
    const { dispatch } = zeige()
    fireEvent.click(document.querySelector('.programm-einfuegen')!)
    fireEvent.change(oben().querySelector<HTMLInputElement>('input')!, { target: { value: 'Örtliche Bedürfnisse' } })
    fireEvent.click(knopf(oben(), t.uebernehmen))
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacAdd', si: LAC, title: 'Örtliche Bedürfnisse' })
    expect(blaetter()).toHaveLength(1)
  })
})

describe('Was nicht bearbeitbar ist', () => {
  it('ein Punkt ohne Minuten öffnet kein Blatt', () => {
    const ohneMinuten = lac()
    delete (ohneMinuten.items[0] as PartItem).mins
    zeige([woche([schaetze(), ohneMinuten])])
    expect([...document.querySelectorAll('.programm-zeile')].map((z) => z.classList.contains('is-bearbeitbar'))).toEqual([
      false,
      false,
      true,
    ])
  })
})
