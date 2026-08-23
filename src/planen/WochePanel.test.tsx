/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { reducer } from '../app/reducer'
import { MeetingTabs } from '../components/MeetingTabs'
import { buildDemoWeeks } from '../data/testdaten'
import { anlassArt } from '../data/anlass'
import { dict } from '../i18n/ui'
import { WochePanel } from './WochePanel'

/**
 * T64 — der Bearbeiten-Reiter und die Ansicht dahinter.
 *
 * Der Befund war ein Bedienelement auf der falschen Ebene: Der
 * Kreisaufseher-Schalter stand im Panel **einer** Zusammenkunft, änderte aber
 * **beide**. Geprüft wird deshalb dreierlei — dass es den Reiter gibt und nur
 * dort, wo er hingehört; dass die Ansicht **beide** Zusammenkünfte zeigt; und
 * dass der Schalter aus dem Zusammenkunfts-Panel verschwunden ist.
 */

function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

const t = dict('de')
const basis = (): AppState => ({ ...initialState(), weeks: buildDemoWeeks(), week: 0, planner: true })

describe('Der Bearbeiten-Reiter', () => {
  it('erscheint nur, wenn er angefordert wird', () => {
    const { queryByLabelText, rerender } = render(
      <Buehne state={basis()}>
        <MeetingTabs tab="mid" onChange={() => {}} showFs />
      </Buehne>,
    )
    expect(queryByLabelText(t.einstellungen)).toBeNull()

    rerender(
      <Buehne state={basis()}>
        <MeetingTabs tab="mid" onChange={() => {}} showFs showEdit />
      </Buehne>,
    )
    // Ein Symbol braucht einen vorgelesenen Namen — er kommt aus `einstellungen`,
    // damit kein Schlüssel erfunden werden muss (33 Overlays, ui.test.ts).
    expect(queryByLabelText(t.einstellungen)).not.toBeNull()
  })

  it('schaltet auf „edit" um', () => {
    let gewaehlt: string | null = null
    const { getByLabelText } = render(
      <Buehne state={basis()}>
        <MeetingTabs tab="mid" onChange={(tab) => (gewaehlt = tab)} showFs showEdit />
      </Buehne>,
    )
    fireEvent.click(getByLabelText(t.einstellungen))
    expect(gewaehlt).toBe('edit')
  })
})

describe('Die Wochen-Ansicht', () => {
  it('zeigt die drei Anlässe und „kein Anlass"', () => {
    const { getByLabelText } = render(
      <Buehne state={basis()}>
        <WochePanel />
      </Buehne>,
    )
    const select = getByLabelText(t.einstellungen) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', 'co', 'mem', 'kongress'])
    // Der erste Eintrag ist ein Gedankenstrich: er braucht keine Übersetzung.
    expect(select.options[0]?.textContent).toBe('—')
    expect([...select.options].map((o) => o.textContent).slice(1)).toEqual([
      t.coWoche,
      t.memWoche,
      t.kongress,
    ])
  })

  it('zeigt **beide** Zusammenkünfte auf einmal', () => {
    // Vorher ging nur die des offenen Reiters: „Mittwoch statt Dienstag" und
    // „Wochenende entfällt" waren zwei Reiterwechsel.
    const { getAllByRole } = render(
      <Buehne state={basis()}>
        <WochePanel />
      </Buehne>,
    )
    const namen = getAllByRole('switch').map((el) => el.getAttribute('aria-label'))
    expect(namen).toEqual([t.tabMid, t.tabWe])
  })

  it('der Kreisaufseher-Schalter steht **nicht** mehr bei einer Zusammenkunft', () => {
    // Genau der Befund, aus dem T64 entstand.
    const { queryByLabelText } = render(
      <Buehne state={basis()}>
        <WochePanel />
      </Buehne>,
    )
    expect(queryByLabelText(t.coWoche)).toBeNull()
  })

  it('zeigt die Termin-Felder erst zum passenden Anlass', () => {
    const ohne = basis()
    const { queryByLabelText, rerender } = render(
      <Buehne state={ohne}>
        <WochePanel />
      </Buehne>,
    )
    expect(queryByLabelText(t.von)).toBeNull()
    expect(queryByLabelText(t.s89Datum)).toBeNull()

    const mit = reducer(ohne, { type: 'setAnlass', art: 'kongress' })
    rerender(
      <Buehne state={mit}>
        <WochePanel />
      </Buehne>,
    )
    expect(anlassArt(mit.weeks[0])).toBe('kongress')
    expect(queryByLabelText(t.von)).not.toBeNull()
    expect(queryByLabelText(t.bis)).not.toBeNull()
  })
})

describe('Der Reiter gilt nur im Planen', () => {
  it('ein Wechsel ins Programm setzt ihn zurück', () => {
    // Das Programm ist für alle nur lesend — dort gibt es nichts zu bearbeiten.
    const stand = { ...basis(), screen: 'planen' as const, tab: 'edit' as const }
    expect(reducer(stand, { type: 'navigate', screen: 'programm' }).tab).toBe('mid')
  })

  it('der Treffpunkt-Reiter überlebt den Wechsel ins Programm dagegen', () => {
    // Gegenprobe zur Regel: „nicht überall erlaubt" heißt nicht „nirgends".
    const stand = { ...basis(), screen: 'planen' as const, tab: 'fs' as const }
    expect(reducer(stand, { type: 'navigate', screen: 'programm' }).tab).toBe('fs')
  })
})

/**
 * **Den Termin des Anlasses eintragen.**
 *
 * Die Prüfung oben hält fest, dass die Felder zum passenden Anlass erscheinen.
 * Was sie schreiben, stand nirgends — und daran hängt mehr als eine Anzeige:
 * Aus dem Gedächtnismahl-Datum leitet die App ab, **welche Zusammenkunft
 * entfällt** (`anlass.ts`, geprüft in `anlass.test.ts`). Kommt das Datum nicht
 * an, bleibt beides stehen, und der Plan zeigt ein Programm, das nicht
 * stattfindet.
 *
 * Beim Kongress ist es ein **Zeitraum**: ein Kreiskongress dauert einen Tag,
 * ein Regionalkongress drei. „Bis" übernimmt beim Eintragen von „Von" denselben
 * Wert — dieselbe Regel wie bei den Abwesenheiten, nicht eine zweite erfundene.
 */
describe('Der Termin des Anlasses', () => {
  /** Zustand mit gesetztem Anlass — über den echten Reducer, nicht von Hand. */
  const mitAnlass = (art: 'mem' | 'kongress'): AppState =>
    reducer(basis(), { type: 'setAnlass', art })

  function zeige(state: AppState) {
    const gesendet: Array<{ type: string } & Record<string, unknown>> = []
    function Bahn() {
      const store = useStaticStore(state)
      return (
        <AppDispatchContext.Provider value={(a) => gesendet.push(a as never)}>
          <AppStoreContext.Provider value={store}>
            <AppStateContext.Provider value={state}>
              <WochePanel />
            </AppStateContext.Provider>
          </AppStoreContext.Provider>
        </AppDispatchContext.Provider>
      )
    }
    return { gesendet, ...render(<Bahn />) }
  }

  /** Im Datumswähler mit der Beschriftung `label` einen Tag anklicken. */
  const waehle = (c: HTMLElement, label: string, tag: string) => {
    const feld = [...c.querySelectorAll<HTMLButtonElement>('.dp-field')].find(
      (b) => b.getAttribute('aria-label') === label,
    )!
    fireEvent.click(feld)
    const knopf = [...feld.closest('.dp')!.querySelectorAll<HTMLButtonElement>('.dp-day')]
      .filter((b) => !b.className.includes('dp-day--muted'))
      .find((b) => b.textContent === tag)!
    fireEvent.click(knopf)
  }

  const termine = (g: Array<{ type: string } & Record<string, unknown>>) =>
    g.filter((a) => a.type === 'setAnlassTermin').map((a) => a.patch)

  it('das Gedächtnismahl trägt ein Datum — daraus folgt der Ausfall', () => {
    const { container, gesendet } = zeige(mitAnlass('mem'))
    waehle(container, t.s89Datum, '15')
    expect(termine(gesendet)).toHaveLength(1)
    expect(String((termine(gesendet)[0] as { von: string }).von)).toMatch(/^\d{4}-\d{2}-15$/)
  })

  it('und eine Uhrzeit — es ist ein Abend nach Sonnenuntergang', () => {
    const { container, gesendet } = zeige(mitAnlass('mem'))
    fireEvent.change(container.querySelector('.sonder-time')!, { target: { value: '19:30' } })
    expect(termine(gesendet)).toContainEqual({ zeit: '19:30' })
  })

  it('der Kongress trägt Von und Bis — er dauert einen bis drei Tage', () => {
    const { container, gesendet } = zeige(mitAnlass('kongress'))
    waehle(container, t.von, '10')
    waehle(container, t.bis, '12')
    const felder = termine(gesendet) as Array<Record<string, string>>
    expect(felder.some((p) => 'von' in p)).toBe(true)
    expect(felder.some((p) => 'bis' in p)).toBe(true)
  })

  it('„Bis" kann nicht vor „Von" liegen — die früheren Tage sind gesperrt', () => {
    const state = reducer(mitAnlass('kongress'), {
      type: 'setAnlassTermin', patch: { von: '2026-09-10' },
    })
    const { container } = zeige(state)
    const bis = [...container.querySelectorAll<HTMLButtonElement>('.dp-field')].find(
      (b) => b.getAttribute('aria-label') === t.bis,
    )!
    fireEvent.click(bis)
    const tage = [...bis.closest('.dp')!.querySelectorAll<HTMLButtonElement>('.dp-day')]
      .filter((b) => !b.className.includes('dp-day--muted'))
    expect(tage.find((b) => b.textContent === '9')?.disabled).toBe(true)
    expect(tage.find((b) => b.textContent === '10')?.disabled).toBe(false)
  })

  it('ein eingetragener Termin steht in den Feldern', () => {
    const state = reducer(mitAnlass('mem'), {
      type: 'setAnlassTermin', patch: { von: '2026-04-02', zeit: '19:30' },
    })
    const { container } = zeige(state)
    const feld = [...container.querySelectorAll('.dp-field')].find(
      (b) => b.getAttribute('aria-label') === t.s89Datum,
    )!
    expect(feld.textContent).toContain('2. Apr. 2026')
    expect(container.querySelector<HTMLInputElement>('.sonder-time')?.value).toBe('19:30')
  })

  it('der Anlass selbst wird über die Auswahl gesetzt und wieder aufgehoben', () => {
    const { container, gesendet } = zeige(basis())
    const wahl = container.querySelector('.woche-anlass-select')!
    fireEvent.change(wahl, { target: { value: 'kongress' } })
    expect(gesendet).toContainEqual({ type: 'setAnlass', art: 'kongress' })
    cleanup()
    const zweiter = zeige(mitAnlass('kongress'))
    fireEvent.change(zweiter.container.querySelector('.woche-anlass-select')!, { target: { value: '' } })
    expect(zweiter.gesendet).toContainEqual({ type: 'setAnlass', art: null })
  })

  it('ohne geladene Woche steht gar nichts da', () => {
    const { container } = zeige({ ...basis(), weeks: [] })
    expect(container.querySelector('.woche-anlass')).toBeNull()
  })
})
