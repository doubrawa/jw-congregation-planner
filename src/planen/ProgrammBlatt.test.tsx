/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { LABEL_LAC } from '../data/constants'
import { ROLE_CIRCUIT } from '../data/helpers'
import { LAC_MAX_MINUTEN, LAC_MIN_MINUTEN } from '../data/meeting-edit'
import type { PartItem, Section, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { ProgrammBlatt } from './ProgrammBlatt'

/**
 * **Das Programm bearbeiten** (T121, Phase 5b) — Titel, Minuten, Reihenfolge,
 * Entfernen und eigene Punkte unter „Unser Leben als Christ".
 *
 * Bis Phase 5b standen diese Regeln an der Steuerung mitten im Plan
 * (`MeetingSection.test.tsx`); seitdem gelten sie im Blatt hinter „Woche
 * einrichten". Am Rand ist das Verschieben gesperrt, Löschen fragt nach, ein
 * neuer Punkt braucht einen Titel. Seit dem 13.10.2026 (Entscheid des
 * Betreibers) stellen − und + die Minuten in Einerschritten, und jeder Punkt
 * außer denen des Kreisaufsehers lässt sich umbenennen.
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

function zeige(weeks: Week[] = [woche()], over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const onClose = vi.fn()
  const state = (w: Week[]): AppState => ({
    ...demoZustand(), dataStatus: 'ready', screen: 'planen', tab: 'edit', planner: true, weeks: w, week: 0, ...over,
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

/** Gesperrt per `aria-disabled` — der Knopf behält so den Fokus (`GesperrterKnopf`). */
const gesperrt = (b: HTMLButtonElement) => b.getAttribute('aria-disabled') === 'true'

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
    expect(document.querySelectorAll('.zeile-hinzu')).toHaveLength(1)
  })

  it('ein Lied steht im Kopf von „Unser Leben als Christ" nur mit Nummer — ohne Liedthema', () => {
    const mitLied = lac()
    mitLied.items.unshift({ song: 'LIED 158 Demo-Liedthema' })
    zeige([woche([schaetze(), mitLied])])
    const koepfe = [...document.querySelectorAll('.prog-abschnitt-kopf .prog-lied')].map((k) => k.textContent)
    expect(koepfe[LAC]).toBe('Lied 158')
  })

  it('nennt den Abschnitt, in dem umgeordnet wird, beim Namen', () => {
    zeige()
    expect(oben().textContent).toContain(t.programmHinweis.replace('{abschnitt}', LABEL_LAC))
  })

  it('ohne Woche steht gar nichts da', () => {
    zeige([])
    expect(blaetter()).toHaveLength(0)
  })

  it('der Titel eines Punkts trägt die Sprache des Programms — er trennt nach ihren Regeln (T128)', () => {
    // Russische App, deutsches Programm: „Versammlungsbibelstudium" trennte
    // im Titel des Blatts sonst russisch.
    zeige([woche()], { lang: 'ru', congLang: 'de' })
    oeffne('Versammlungsbibelstudium')
    const titel = oben().querySelector('.sheet-title [lang]')
    expect(titel?.getAttribute('lang')).toBe('de')
    expect(titel?.textContent).toBe('Versammlungsbibelstudium')
  })
})

describe('Die Dauer eines Programmpunkts', () => {
  it('steht zwischen − und + — samt Einheit', () => {
    zeige()
    oeffne('Versammlungsbibelstudium')
    expect(blaetter()).toHaveLength(2)
    const gruppe = oben().querySelector<HTMLElement>('.plus-minus')!
    expect(gruppe.getAttribute('aria-label')).toBe(t.a11yMinuten)
    expect(gruppe.querySelector('.plus-minus-wert')?.textContent).toBe('30 Min.')
  })

  it('− und + zählen in Einerschritten — jede Minute ist erreichbar, nicht nur jede fünfte', () => {
    const { dispatch } = zeige()
    oeffne('Versammlungsbibelstudium')
    fireEvent.click(oben().querySelector<HTMLButtonElement>(`.plus-minus [aria-label="${t.a11yIncrease}"]`)!)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'lacMinuten', si: LAC, ii: 1, mins: 31 })
    fireEvent.click(oben().querySelector<HTMLButtonElement>(`.plus-minus [aria-label="${t.a11yDecrease}"]`)!)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'lacMinuten', si: LAC, ii: 1, mins: 29 })
  })

  it('an den Grenzen 5 und 45 ist der Knopf in diese Richtung gesperrt — und tut nichts', () => {
    const lang = lac()
    ;(lang.items[1] as PartItem).mins = LAC_MAX_MINUTEN
    const { dispatch } = zeige([woche([schaetze(), lang])])
    oeffne('Örtliche Hinweise')
    const knoepfe = () => [...oben().querySelectorAll<HTMLButtonElement>('.plus-minus button')]
    // Örtliche Hinweise: 5 Minuten — weniger geht nicht.
    expect(LAC_MIN_MINUTEN).toBe(5)
    expect(knoepfe().map(gesperrt)).toEqual([true, false])
    fireEvent.click(knoepfe()[0]!)
    expect(dispatch).not.toHaveBeenCalled()
    cleanup()
    zeige([woche([schaetze(), lang])])
    oeffne('Versammlungsbibelstudium')
    expect(knoepfe().map(gesperrt)).toEqual([false, true])
  })

  it('gesperrt behält der Knopf den Fokus — sonst stünde, wer per Tastatur zählt, hinter dem Blatt', () => {
    zeige()
    oeffne('Örtliche Hinweise')
    const weniger = oben().querySelector<HTMLButtonElement>(`.plus-minus [aria-label="${t.a11yDecrease}"]`)!
    weniger.focus()
    expect(weniger.disabled).toBe(false)
    expect(document.activeElement).toBe(weniger)
  })
})

describe('Der Titel eines Programmpunkts', () => {
  const titelFeld = () => oben().querySelector<HTMLInputElement>('.programmpunkt-feld input')!

  it('steht im Feld und gilt beim Verlassen — nicht bei jedem Tastendruck', () => {
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    expect(oben().querySelector('.programmpunkt-feld label')?.textContent).toBe(t.programmpunktTitel)
    expect(titelFeld().value).toBe('Örtliche Hinweise')
    fireEvent.change(titelFeld(), { target: { value: 'Spendenbericht ' } })
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.blur(titelFeld())
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacTitel', si: LAC, ii: 0, title: 'Spendenbericht' })
  })

  it('wer das Feld nur betritt und verlässt, ändert nichts — und leer bleibt der alte Titel', () => {
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    fireEvent.focus(titelFeld())
    fireEvent.blur(titelFeld())
    // Zurückgetippt auf den Titel, der dasteht: In einer fremdsprachigen
    // Versammlung schriebe das die Anzeige über alle Sprachen. Erst weg und
    // dann zurück — denselben Wert noch einmal meldet React gar nicht als
    // Änderung.
    fireEvent.change(titelFeld(), { target: { value: 'Örtliche Hinweis' } })
    fireEvent.change(titelFeld(), { target: { value: 'Örtliche Hinweise' } })
    fireEvent.blur(titelFeld())
    fireEvent.change(titelFeld(), { target: { value: '   ' } })
    fireEvent.blur(titelFeld())
    expect(dispatch).not.toHaveBeenCalled()
    expect(titelFeld().value).toBe('Örtliche Hinweise')
  })

  it('Escape nimmt die Eingabe zurück und lässt das Blatt offen; erst ein zweites schließt es', () => {
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    fireEvent.change(titelFeld(), { target: { value: 'Etwas anderes' } })
    fireEvent.keyDown(titelFeld(), { key: 'Escape' })
    expect(titelFeld().value).toBe('Örtliche Hinweise')
    expect(blaetter()).toHaveLength(2)
    fireEvent.keyDown(titelFeld(), { key: 'Escape' })
    expect(blaetter()).toHaveLength(1)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('wer das Blatt schließt, während er tippt, verliert den Titel nicht', () => {
    // Die Zurück-Taste am Handy schließt das Blatt, während der Fokus noch im
    // Feld steht — hier das Kreuz, das in jsdom den Fokus ebenso stehen lässt.
    // Das Feld verlässt dann `Sheet`, bevor es schließt.
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    titelFeld().focus()
    fireEvent.change(titelFeld(), { target: { value: 'Spendenbericht' } })
    fireEvent.click(oben().querySelector<HTMLButtonElement>(`.sheet-head [aria-label="${t.a11yClose}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacTitel', si: LAC, ii: 0, title: 'Spendenbericht' })
    expect(blaetter()).toHaveLength(1)
  })

  it('ein Punkt des Kreisaufsehers hat kein Titelfeld — sein Thema steht im Plan', () => {
    const coWoche = lac()
    coWoche.items[1] = {
      iid: 'i88', num: 9, title: 'Dienstvortrag', meta: '30 Min.', mins: 30,
      names: [{ name: '', rolle: ROLE_CIRCUIT, bereichsKey: 'vortrag' }],
    }
    zeige([woche([schaetze(), coWoche])])
    oeffne('Dienstvortrag')
    expect(oben().querySelector('.programmpunkt-feld')).toBeNull()
    expect(oben().querySelector('.plus-minus')).not.toBeNull()
  })
})

describe('Ein Programmpunkt', () => {

  it('am Rand ist das Verschieben gesperrt — nach oben beim ersten, nach unten beim letzten', () => {
    const { dispatch } = zeige()
    oeffne('Örtliche Hinweise')
    expect(gesperrt(knopf(oben(), t.a11yMoveUp))).toBe(true)
    expect(gesperrt(knopf(oben(), t.a11yMoveDown))).toBe(false)
    fireEvent.click(knopf(oben(), t.a11yMoveUp))
    expect(dispatch).not.toHaveBeenCalled()
    cleanup()
    zeige()
    oeffne('Versammlungsbibelstudium')
    expect(gesperrt(knopf(oben(), t.a11yMoveUp))).toBe(false)
    expect(gesperrt(knopf(oben(), t.a11yMoveDown))).toBe(true)
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
    const entfernen = oben().querySelector<HTMLButtonElement>('.knopf-entfernen')!
    fireEvent.click(entfernen)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'lacRemove', si: LAC, ii: 0 })
    expect(entfernen.textContent).toBe(t.entfernenSicher)
    bestaetigen(entfernen)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacRemove', si: LAC, ii: 0 })
    expect(blaetter()).toHaveLength(1)
  })
})

describe('Ein eigener Punkt', () => {
  it('braucht einen Titel — leer bittet darum', () => {
    const { dispatch } = zeige()
    fireEvent.click(document.querySelector('.zeile-hinzu')!)
    fireEvent.click(knopf(oben(), t.hinzufuegenKnopf))
    // Um einen Titel, nicht um einen Namen (T123): Polnisch hieß das „Wpisz
    // imię", den Vornamen einer Person eintragen.
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastTitelEingeben })
    expect(dispatch.mock.calls.some((c) => (c[0] as { type: string }).type === 'lacAdd')).toBe(false)
  })

  it('mit Titel wird er eingefügt, und das Blatt geht zu', () => {
    const { dispatch } = zeige()
    fireEvent.click(document.querySelector('.zeile-hinzu')!)
    fireEvent.change(oben().querySelector<HTMLInputElement>('input')!, { target: { value: 'Örtliche Bedürfnisse' } })
    fireEvent.click(knopf(oben(), t.hinzufuegenKnopf))
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
