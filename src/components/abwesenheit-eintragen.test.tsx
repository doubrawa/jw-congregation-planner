/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Person } from '../data/types'
import { AbwesenheitEintragen } from './AbwesenheitEintragen'
import { zeitraumTippen } from './kalender'

/**
 * **Eine Abwesenheit eintragen** (T121) — der eine Vorgang, den jeder
 * Verkündiger selbst ausführt, im Profil für sich und im Personen-Detail der
 * Planer für andere. Ein Blatt mit einem Zeitraum-Kalender.
 *
 * - **Ein Tag ist ein Tipp.** Der erste Tipp setzt Von und Bis auf denselben
 *   Tag; ein zweiter danach verlängert bis dorthin.
 * - **Von liegt nie nach Bis.** Ein Tipp vor „Von" beginnt den Zeitraum neu,
 *   statt ihn rückwärts aufzuspannen — sonst entstünde ein Zeitraum, den keine
 *   Prüfung je trifft.
 * - **Eintragen darf, wen es betrifft, oder ein Admin.** Dieselbe Grenze zieht
 *   die Datenbank (`absences_write`); stünde der Knopf anderen offen, schriebe
 *   er ins Leere und die Zeile verschwände beim nächsten Laden.
 */

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}

function zeige(personId: string | null, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], absences: [], weeks: [], fsWeeks: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AbwesenheitEintragen personId={personId} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/** Das Blatt liegt per Portal am Ende des Dokuments, nicht im Container. */
const blatt = () => document.body.querySelector<HTMLElement>('.sheet')
const knopf = (root: ParentNode | null, text: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.textContent === text)
/** Einen Tag des angezeigten Monats antippen (nach seinem Namen für Vorleseprogramme). */
const tippe = (name: string) => {
  const tag = [...document.body.querySelectorAll<HTMLButtonElement>('.kal-tag')].find((b) => b.getAttribute('aria-label') === name)
  if (!tag) throw new Error(`Tag „${name}" nicht im Kalender`)
  fireEvent.click(tag)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0)) // Donnerstag, 15. Oktober 2026
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('Den Zeitraum wählen', () => {
  const leer = { von: '', bis: '', ende: 'von' as const }

  it('ein Tag ist ein Tipp: Von und Bis stehen auf demselben Tag', () => {
    expect(zeitraumTippen(leer, '2026-11-02')).toEqual({ von: '2026-11-02', bis: '2026-11-02', ende: 'bis' })
  })

  it('der zweite Tipp danach verlängert bis dorthin', () => {
    const erster = zeitraumTippen(leer, '2026-11-02')
    expect(zeitraumTippen(erster, '2026-11-06')).toEqual({ von: '2026-11-02', bis: '2026-11-06', ende: 'bis' })
  })

  it('ein Tipp vor „Von" beginnt neu — Von liegt nie nach Bis', () => {
    const stand = { von: '2026-11-02', bis: '2026-11-06', ende: 'bis' as const }
    expect(zeitraumTippen(stand, '2026-10-30')).toEqual({ von: '2026-10-30', bis: '2026-11-06', ende: 'bis' })
  })

  it('ist „Von" gewählt, verschiebt ein Tipp nach „Bis" beide Enden', () => {
    const stand = { von: '2026-11-02', bis: '2026-11-06', ende: 'von' as const }
    expect(zeitraumTippen(stand, '2026-11-09')).toEqual({ von: '2026-11-09', bis: '2026-11-09', ende: 'bis' })
  })
})

describe('Abwesenheit eintragen', () => {
  const oeffne = () => fireEvent.click(knopf(document.body, t.abwEintragen)!)

  it('der Knopf öffnet das Blatt mit dem Kalender', () => {
    zeige('p-a')
    expect(blatt()).toBeNull()
    oeffne()
    expect(blatt()?.querySelector('.kal')).not.toBeNull()
    expect(blatt()?.querySelector('.sheet-title')?.textContent).toBe(t.abwEintragen)
  })

  it('ohne Zeitraum wird nichts eingetragen, sondern nachgefragt', () => {
    const { dispatch } = zeige('p-a')
    oeffne()
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastVonBis })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addAbsence')).toBe(false)
    expect(blatt()).not.toBeNull()
  })

  it('ein vollständiger Zeitraum wird eingetragen — auf DIESE Person, mit Ersteller und Grund', () => {
    const { dispatch } = zeige('p-a')
    oeffne()
    tippe('Dienstag, 20. Oktober')
    tippe('Freitag, 23. Oktober')
    fireEvent.change(blatt()!.querySelector('input.feld')!, { target: { value: '  Urlaub ' } })
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addAbsence',
      absence: expect.objectContaining({ personId: 'p-a', userId: 'u1', from: '2026-10-20', to: '2026-10-23', reason: 'Urlaub' }),
    })
    // Danach geht das Blatt zu.
    expect(blatt()).toBeNull()
  })

  it('der Planer trägt für eine ANDERE Person ein — sie ist die Betroffene, er der Ersteller', () => {
    const { dispatch } = zeige('p-b', { planner: true })
    oeffne()
    tippe('Montag, 19. Oktober')
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addAbsence',
      absence: expect.objectContaining({ personId: 'p-b', userId: 'u1', from: '2026-10-19', to: '2026-10-19' }),
    })
  })

  it('ein Konto ohne eigene Person trägt ohne Person-Bezug ein', () => {
    const { dispatch } = zeige(null, { personId: null })
    oeffne()
    tippe('Dienstag, 20. Oktober')
    fireEvent.click(knopf(blatt(), t.abwEintragen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'addAbsence', absence: expect.objectContaining({ personId: null }) })
  })

  it('das Blatt blättert die Monate', () => {
    zeige('p-a')
    oeffne()
    expect(blatt()?.querySelector('.kal-monat')?.textContent).toBe('Oktober 2026')
    fireEvent.click(blatt()!.querySelector(`[aria-label="${t.a11yNextMonth}"]`)!)
    expect(blatt()?.querySelector('.kal-monat')?.textContent).toBe('November 2026')
  })
})

describe('Wer eintragen darf', () => {
  it('die eigene Person', () => {
    expect(knopf(zeige('p-a').container, t.abwEintragen)).toBeDefined()
  })

  it('ein Admin bei jeder Person', () => {
    expect(knopf(zeige('p-b', { planner: true }).container, t.abwEintragen)).toBeDefined()
  })

  it('sonst niemand — kein Knopf, der ins Leere schriebe', () => {
    expect(knopf(zeige('p-b').container, t.abwEintragen)).toBeUndefined()
  })
})
