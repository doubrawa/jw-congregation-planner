/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { helferKey, punktKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { bestaetigen } from '../../tests/zwei-tipps'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { emptyQualifications, ROLE_OWN_SPEAKER } from '../data/helpers'
import type { Person, Service, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { PersonDetail } from './PersonDetail'

/**
 * **Wer etwas nicht mehr macht** (T182) — an den Stellen, an denen der Admin
 * es ändert: die Aufgabenbereiche, „Person bearbeiten" (Rolle, Geschlecht) und
 * „Person entfernen".
 *
 * Betreiber, 13.11.2026: Vorher fragen, mit Wahl. Das Blatt nennt die
 * künftigen Plätze, die danach nicht mehr passen; „Plätze freigeben" macht sie
 * offen, „Stehen lassen" ändert nur die Person, „Abbrechen" nichts. Wo nichts
 * verloren geht, kommt keine Frage.
 */

const t = dict('de')
const MONTAG = '2026-11-23'
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 1 },
  { key: 'eingang', name: 'Ordner', count: 1 },
]
const ANTON: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'aeltester', female: false, grp: null,
  priv: { ...emptyQualifications(), 'svc:mik': true, 'svc:eingang': true },
}
const MIKRO = helferKey(MONTAG, 'we', 'mik', 0)
const VORTRAG = punktKey(MONTAG, 'we', 'i-vortrag', 0, false)

/** Am Sonntag hält Anton den Vortrag und steht am Mikrofon. */
function woche(): Week {
  return {
    range: '', book: '', start: MONTAG,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: {
      date: '', end: '',
      sections: [{ label: 'VORTRAG', farbe: 'petrol', items: [{ iid: 'i-vortrag', title: 'Thema', names: [{ name: 'Anton Alt', pid: 'p-a', rolle: ROLE_OWN_SPEAKER }] }] }],
      helpers: { mik: [{ name: 'Anton Alt', pid: 'p-a' }] },
    },
  }
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'personen', dataStatus: 'ready', lang: 'de',
    congregationId: 'c1', userId: 'u1', admin: true,
    persons: [ANTON], groups: [], services: DIENSTE, members: [], anmeldeLinks: [],
    weeks: [woche()], fsWeeks: [[]], absences: [], confirmations: {},
    congregation: { name: 'Probe', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PersonDetail person={state.persons[0]!} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const blatt = (label: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`)
const knopf = (wo: ParentNode, text: string) =>
  [...wo.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)
const schalter = (wo: ParentNode, label: string) => wo.querySelector<HTMLElement>(`[role="switch"][aria-label="${label}"]`)!
const aktionen = (dispatch: ReturnType<typeof vi.fn>) => dispatch.mock.calls.map((c) => c[0].type)
/** Die Zeilen des Blatts, als Text. */
const zeilen = () => [...(blatt(t.freiTitel) ?? blatt(t.persLoeschen))!.querySelectorAll('.frei-zeile')].map((z) => z.textContent)

/** „Mikrofone" im Blatt der Aufgabenbereiche ausschalten. */
function mikrofonAus(c: HTMLElement): void {
  fireEvent.click(knopf(c, t.aendern)!)
  fireEvent.click(schalter(blatt(t.aufgabenbereiche)!, 'Mikrofone'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 9, 0)) // Mittwoch davor
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Einen Bereich abschalten, an dem künftige Plätze hängen', () => {
  it('erst fragt ein Blatt — es nennt die Plätze, geändert ist noch nichts', () => {
    const { container, dispatch } = zeige()
    mikrofonAus(container)
    expect(blatt(t.freiTitel)).not.toBeNull()
    expect(zeilen()).toHaveLength(1)
    expect(zeilen()[0]).toContain('Mikrofone')
    expect(aktionen(dispatch)).toEqual([])
  })

  it('„Plätze freigeben": die Person ändert sich, und genau diese Plätze werden offen', () => {
    const { container, dispatch } = zeige()
    mikrofonAus(container)
    fireEvent.click(knopf(blatt(t.freiTitel)!, t.plaetzeFreigebenBtn)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'updatePerson', id: 'p-a', patch: { priv: expect.objectContaining({ 'svc:mik': false }) } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'plaetzeFreigeben', personId: 'p-a', keys: [MIKRO] })
    expect(blatt(t.freiTitel)).toBeNull()
  })

  it('„Stehen lassen": nur die Person ändert sich', () => {
    const { container, dispatch } = zeige()
    mikrofonAus(container)
    fireEvent.click(knopf(blatt(t.freiTitel)!, t.stehenLassenBtn)!)
    expect(aktionen(dispatch)).toEqual(['updatePerson'])
  })

  it('„Abbrechen": nichts ändert sich', () => {
    const { container, dispatch } = zeige()
    mikrofonAus(container)
    fireEvent.click(knopf(blatt(t.freiTitel)!, t.abbrechen)!)
    expect(aktionen(dispatch)).toEqual([])
    expect(blatt(t.freiTitel)).toBeNull()
  })

  it('Gegenprobe: Wo keine künftigen Plätze hängen, gilt der Schalter sofort', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.aendern)!)
    fireEvent.click(schalter(blatt(t.aufgabenbereiche)!, 'Ordner'))
    expect(blatt(t.freiTitel)).toBeNull()
    expect(dispatch).toHaveBeenCalledWith({ type: 'updatePerson', id: 'p-a', patch: { priv: expect.objectContaining({ 'svc:eingang': false }) } })
  })

  it('Gegenprobe: Vergangenes fragt nicht — die Woche ist vorbei', () => {
    vi.setSystemTime(new Date(2026, 11, 2, 9, 0))
    const { container, dispatch } = zeige()
    mikrofonAus(container)
    expect(blatt(t.freiTitel)).toBeNull()
    expect(aktionen(dispatch)).toEqual(['updatePerson'])
  })
})

describe('Person bearbeiten: die Rolle', () => {
  it('wer kein Ältester mehr ist, verliert den Redner-Platz — erst kommt die Frage', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector(`[aria-label="${t.personBearbeiten}"]`)!)
    const rolle = blatt(t.personBearbeiten)!.querySelector<HTMLSelectElement>('#pers-rolle')!
    fireEvent.change(rolle, { target: { value: 'verkuendiger' } })
    expect(blatt(t.freiTitel)).not.toBeNull()
    fireEvent.click(knopf(blatt(t.freiTitel)!, t.plaetzeFreigebenBtn)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'updatePerson', id: 'p-a', patch: { role: 'verkuendiger' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'plaetzeFreigeben', personId: 'p-a', keys: [VORTRAG] })
  })

  it('Gegenprobe: Dienstamtgehilfe hält den Vortrag weiter — keine Frage', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(container.querySelector(`[aria-label="${t.personBearbeiten}"]`)!)
    fireEvent.change(blatt(t.personBearbeiten)!.querySelector('#pers-rolle')!, { target: { value: 'dienstamtgehilfe' } })
    expect(blatt(t.freiTitel)).toBeNull()
    expect(dispatch).toHaveBeenCalledWith({ type: 'updatePerson', id: 'p-a', patch: { role: 'dienstamtgehilfe' } })
  })
})

describe('Person entfernen', () => {
  it('mit künftigen Plätzen fragt ein Blatt — „Plätze freigeben" entfernt sie samt dieser Plätze', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.persLoeschen)!)
    expect(zeilen()).toHaveLength(2)
    fireEvent.click(knopf(blatt(t.persLoeschen)!, t.plaetzeFreigebenBtn)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removePerson', id: 'p-a', freigeben: [VORTRAG, MIKRO] })
  })

  it('„Stehen lassen" entfernt sie, die Namen bleiben', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.persLoeschen)!)
    fireEvent.click(knopf(blatt(t.persLoeschen)!, t.stehenLassenBtn)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removePerson', id: 'p-a' })
  })

  it('geht ihr Konto mit, sagt es das Blatt dazu', () => {
    const { container } = zeige({ members: [{ userId: 'u-anton', personId: 'p-a', admin: false, zuteiler: false } as AppState['members'][number]] })
    fireEvent.click(knopf(container, t.persLoeschen)!)
    expect(blatt(t.persLoeschen)!.querySelector('.frei-fuss .klein-text')?.textContent).toContain(t.confirmPersonDelKonto)
  })

  it('Gegenprobe: ohne künftige Plätze wie bisher — zwei Tipps, kein Blatt', () => {
    const { container, dispatch } = zeige({ weeks: [] })
    fireEvent.click(knopf(container, t.persLoeschen)!)
    expect(blatt(t.persLoeschen)).toBeNull()
    bestaetigen(container.querySelector<HTMLButtonElement>('.person-entfernen')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removePerson', id: 'p-a' })
  })
})
