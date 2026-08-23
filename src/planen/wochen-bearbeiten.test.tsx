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
import { initialState } from '../app/init'
import { dict } from '../i18n/ui'
import type { Termin, Week } from '../data/types'
import { SonderwochePanel } from './SonderwochePanel'
import { TerminePanel } from './TerminePanel'

/**
 * **Der Bearbeiten-Reiter der Woche (T63/T64)** — was `WochePanel.test.tsx`
 * an Aufbau prüft, hier an Wirkung.
 *
 * Zwei Ebenen mit je einer eigenen Regel, die man sich nicht ansieht:
 *
 * - **Je Zusammenkunft** (Sonderwoche): Wählt der Planer wieder den *regulären*
 *   Tag oder die *reguläre* Zeit, ist das **keine** Verlegung — die Abweichung
 *   muss verschwinden. Bliebe sie stehen, gälte die Woche für immer als
 *   abweichend, und der Chip in der Navigation ginge nie wieder weg.
 * - **Je Woche** (Termine): Die Liste wird beim Tippen **nicht** sortiert.
 *   Spränge die Zeile schon bei der Wahl des Tages an ihren Platz, verlöre das
 *   Feld darunter mitten in der Eingabe den Fokus. Sortiert wird erst bei der
 *   Anzeige (`termineVon`, geprüft in `termine.test.ts`).
 */

const t = dict('de')

function woche(over: Partial<Week> = {}): Week {
  return {
    range: '7.–13. September', book: '', start: '2026-09-07', current: false,
    mid: { date: '', end: '20:45', sections: [], helpers: {} },
    we: { date: '', end: '11:45', sections: [], helpers: {} },
    ...over,
  }
}

function zeige(was: 'sonder' | 'termine', over: Partial<AppState> = {}, tab: 'mid' | 'we' = 'mid') {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'planen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    persons: [], services: [], groups: [], weeks: [woche()], fsWeeks: [], week: 0,
    congregation: { name: 'Test', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'sonder' ? <SonderwochePanel tab={tab} /> : <TerminePanel />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const patches = (dispatch: ReturnType<typeof vi.fn>, typ: string) =>
  dispatch.mock.calls.filter((c) => c[0].type === typ).map((c) => c[0].patch)

afterEach(cleanup)

describe('Findet diese Zusammenkunft statt?', () => {
  it('normalerweise ja — der Schalter steht an', () => {
    const { container } = zeige('sonder')
    const schalter = container.querySelector('[role="switch"]')!
    expect(schalter.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('.sonder-name')?.textContent).toBe(t.tabMid)
  })

  it('ein Tipp streicht sie', () => {
    const { container, dispatch } = zeige('sonder')
    fireEvent.click(container.querySelector('[role="switch"]')!)
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ cancelled: true })
  })

  it('noch einer nimmt den Strich zurück — als „nicht gesetzt", nicht als „false"', () => {
    // Ein `cancelled: false` bliebe als Abweichung stehen, und die Woche
    // gälte weiter als abweichend.
    const { container, dispatch } = zeige('sonder', {
      weeks: [woche({ dev: { mid: { cancelled: true } } })],
    })
    fireEvent.click(container.querySelector('[role="switch"]')!)
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ cancelled: undefined })
  })

  it('bei gestrichener Zusammenkunft gibt es keinen Termin mehr einzustellen', () => {
    const { container } = zeige('sonder', { weeks: [woche({ dev: { mid: { cancelled: true } } })] })
    expect(container.querySelector('.sonder-row--termin')).toBeNull()
    // Der Grund bleibt: gerade dann will man ihn hinschreiben.
    expect(container.querySelector('.sonder-grund')).toBeTruthy()
  })

  it('eine abweichende Zusammenkunft hebt sich ab', () => {
    const normal = zeige('sonder')
    expect(normal.container.querySelector('.sonder')?.className).not.toContain('is-abweichend')
    cleanup()
    const abweichend = zeige('sonder', { weeks: [woche({ dev: { mid: { day: 'Donnerstag' } } })] })
    expect(abweichend.container.querySelector('.sonder')?.className).toContain('is-abweichend')
  })
})

describe('Tag und Uhrzeit verlegen', () => {
  it('vorbelegt ist der geltende Termin aus den Einstellungen', () => {
    const { container } = zeige('sonder')
    expect(container.querySelector<HTMLSelectElement>('.sonder-select')?.value).toBe('1') // Dienstag
    expect(container.querySelector<HTMLInputElement>('.sonder-time')?.value).toBe('19:00')
  })

  it('ein anderer Tag wird als Verlegung eingetragen — kanonisch deutsch', () => {
    const { container, dispatch } = zeige('sonder')
    fireEvent.change(container.querySelector('.sonder-select')!, { target: { value: '3' } })
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ day: 'Donnerstag' })
  })

  it('der reguläre Tag ist KEINE Verlegung — die Abweichung fällt weg', () => {
    const { container, dispatch } = zeige('sonder', {
      weeks: [woche({ dev: { mid: { day: 'Donnerstag' } } })],
    })
    fireEvent.change(container.querySelector('.sonder-select')!, { target: { value: '1' } })
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ day: undefined })
  })

  it('eine andere Uhrzeit wird als Verlegung eingetragen', () => {
    const { container, dispatch } = zeige('sonder')
    fireEvent.change(container.querySelector('.sonder-time')!, { target: { value: '18:30' } })
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ time: '18:30' })
  })

  it('die reguläre Uhrzeit nimmt die Verlegung wieder zurück', () => {
    const { container, dispatch } = zeige('sonder', {
      weeks: [woche({ dev: { mid: { time: '18:30' } } })],
    })
    fireEvent.change(container.querySelector('.sonder-time')!, { target: { value: '19:00' } })
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ time: undefined })
  })

  it('eine bestehende Verlegung steht in den Feldern', () => {
    const { container } = zeige('sonder', {
      weeks: [woche({ dev: { mid: { day: 'Mittwoch', time: '18:00' } } })],
    })
    expect(container.querySelector<HTMLSelectElement>('.sonder-select')?.value).toBe('2')
    expect(container.querySelector<HTMLInputElement>('.sonder-time')?.value).toBe('18:00')
  })

  it('die beiden Zusammenkünfte sind unabhängig', () => {
    const { container, dispatch } = zeige('sonder', {}, 'we')
    expect(container.querySelector('.sonder-name')?.textContent).toBe(t.tabWe)
    fireEvent.click(container.querySelector('[role="switch"]')!)
    expect(dispatch.mock.calls[0]![0].tab).toBe('we')
  })

  it('der Grund ist Freitext in der Leserichtung seiner Schrift', () => {
    const { container, dispatch } = zeige('sonder')
    const feld = container.querySelector<HTMLInputElement>('.sonder-grund')!
    expect(feld.getAttribute('dir')).toBe('auto')
    fireEvent.change(feld, { target: { value: 'Kongress in Nürnberg' } })
    expect(patches(dispatch, 'setAbweichung')).toContainEqual({ reason: 'Kongress in Nürnberg' })
  })
})

describe('Weitere Termine der Woche (T63)', () => {
  const termin = (over: Partial<Termin> = {}): Termin =>
    ({ id: 'x1', title: 'Pionierbesprechung', ...over }) as Termin

  it('ohne Termine steht nur der Hinzufügen-Knopf da', () => {
    const { container } = zeige('termine')
    expect(container.querySelectorAll('.sonder')).toHaveLength(0)
    expect(container.querySelector('.termin-add')?.textContent).toBe(t.hinzufuegen)
  })

  it('„hinzufügen" legt einen leeren an', () => {
    const { container, dispatch } = zeige('termine')
    fireEvent.click(container.querySelector('.termin-add')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'terminAdd' })
  })

  it('jeder Termin hat Bezeichnung, Tag, Uhrzeit und Ort', () => {
    const { container } = zeige('termine', {
      weeks: [woche({ termine: [termin({ day: 'Donnerstag', time: '19:30', place: 'Saal' })] })],
    })
    const felder = [...container.querySelectorAll<HTMLInputElement>('.sonder-grund')]
    expect(felder[0]!.value).toBe('Pionierbesprechung')
    expect(felder[1]!.value).toBe('Saal')
    expect(container.querySelector<HTMLSelectElement>('.sonder-select')?.value).toBe('Donnerstag')
    expect(container.querySelector<HTMLInputElement>('.sonder-time')?.value).toBe('19:30')
  })

  it('jedes Feld schreibt nur sein eigenes', () => {
    const { container, dispatch } = zeige('termine', { weeks: [woche({ termine: [termin()] })] })
    fireEvent.change(container.querySelectorAll('.sonder-grund')[0]!, { target: { value: 'Neu' } })
    expect(patches(dispatch, 'terminUpdate')).toContainEqual({ title: 'Neu' })
    fireEvent.change(container.querySelector('.sonder-select')!, { target: { value: 'Montag' } })
    expect(patches(dispatch, 'terminUpdate')).toContainEqual({ day: 'Montag' })
    fireEvent.change(container.querySelector('.sonder-time')!, { target: { value: '18:00' } })
    expect(patches(dispatch, 'terminUpdate')).toContainEqual({ time: '18:00' })
    fireEvent.change(container.querySelectorAll('.sonder-grund')[1]!, { target: { value: 'Park' } })
    expect(patches(dispatch, 'terminUpdate')).toContainEqual({ place: 'Park' })
  })

  it('ein geleertes Feld wird zu „nicht gesetzt" — nicht zu einem leeren String', () => {
    // Sonst gälte ein leerer Ort als Ort und stünde als Lücke in der Anzeige.
    const { container, dispatch } = zeige('termine', {
      weeks: [woche({ termine: [termin({ day: 'Montag', place: 'Saal' })] })],
    })
    fireEvent.change(container.querySelector('.sonder-select')!, { target: { value: '' } })
    expect(patches(dispatch, 'terminUpdate')).toContainEqual({ day: undefined })
    fireEvent.change(container.querySelectorAll('.sonder-grund')[1]!, { target: { value: '' } })
    expect(patches(dispatch, 'terminUpdate')).toContainEqual({ place: undefined })
  })

  it('ein Termin lässt sich entfernen', () => {
    const { container, dispatch } = zeige('termine', { weeks: [woche({ termine: [termin()] })] })
    fireEvent.click(container.querySelector('.fs-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'terminRemove', id: 'x1' })
  })

  it('mehrere Termine je Woche — jeder für sich bedienbar', () => {
    const { container, dispatch } = zeige('termine', {
      weeks: [woche({ termine: [termin({ id: 'x1' }), termin({ id: 'x2', title: 'Zweiter' })] })],
    })
    expect(container.querySelectorAll('.sonder')).toHaveLength(2)
    fireEvent.click([...container.querySelectorAll('.fs-remove')][1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'terminRemove', id: 'x2' })
  })

  it('die Liste bleibt beim Tippen in ihrer Reihenfolge — sonst spränge das Feld weg', () => {
    // Sortiert wird erst bei der Anzeige. Hier steht der Donnerstag deshalb
    // weiter vor dem Montag, obwohl er später in der Woche liegt.
    const { container } = zeige('termine', {
      weeks: [woche({
        termine: [termin({ id: 'x1', title: 'Donnerstag-Termin', day: 'Donnerstag' }),
                  termin({ id: 'x2', title: 'Montag-Termin', day: 'Montag' })],
      })],
    })
    const titel = [...container.querySelectorAll<HTMLInputElement>('.sonder-grund')]
      .filter((_, i) => i % 2 === 0)
      .map((f) => f.value)
    expect(titel).toEqual(['Donnerstag-Termin', 'Montag-Termin'])
  })

  it('die Wochentage stehen in der Sprache des Lesers, gespeichert kanonisch deutsch', () => {
    const { container } = zeige('termine', { weeks: [woche({ termine: [termin()] })] })
    const optionen = [...container.querySelector('.sonder-select')!.querySelectorAll('option')]
    expect(optionen[0]?.value).toBe('') // „kein Tag"
    expect(optionen[1]?.value).toBe('Montag')
    expect(optionen[1]?.textContent).toBe('Montag')
    expect(optionen).toHaveLength(8) // Gedankenstrich + 7 Tage
  })

  it('ohne geladene Woche steht gar nichts da', () => {
    const { container } = zeige('termine', { weeks: [] })
    expect(container.querySelector('.termin-add')).toBeNull()
  })
})
