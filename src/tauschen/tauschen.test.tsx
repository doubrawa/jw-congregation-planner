/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { helferKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { bestaetigen } from '../../tests/zwei-tipps'
import { AufgabeHandlungen } from '../aufgaben/AufgabeKarte'
import type { TauschAnfrage } from '../data/tausch'
import type { MyTask, Person, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { TauschAnfragen } from './TauschAnfragen'
import { TauschenBlatt } from './TauschenBlatt'

/**
 * **Tauschen in der Oberfläche** (T153): „Tauschen" neben „Ich kann nicht",
 * das Blatt mit denen, die tauschen könnten, und die Karte beim Gefragten mit
 * „Tauschen" und „Nein, danke" — wie im Entwurf vom 29.10.2026.
 *
 * Ohne Datenbank (wie hier) rechnet die App die Angebote nach den Regeln des
 * Servers und nimmt jeden Schritt an; was die Function dazu schickt und
 * antwortet, prüft `lib/tauschen.test.ts`.
 */

const t = dict('de')
const W1 = '2026-09-07' // Sonntag 13.9.
const W2 = '2026-09-14' // Sonntag 20.9.
const A = helferKey(W1, 'we', 'mik', 0)
const B = helferKey(W2, 'we', 'mik', 0)

const person = (id: string, fn: string, ln: string): Person =>
  ({ id, fn, ln, role: 'verkuendiger', female: false, mail: '', priv: { 'svc:mik': true } }) as unknown as Person

const woche = (start: string, name: string, pid: string): Week =>
  ({
    range: '', book: '', start,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: { mik: [{ name, pid }] } },
  }) as Week

/** Simons Aufgabe: Mikrofone am Sonntag, 13. September. */
const AUFGABE = { id: A, title: '', rolle: 'Mikrofone', date: 'Sonntag, 13. September · 10:00', at: Date.UTC(2026, 8, 13), status: 'offen', s89: null } as MyTask

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    lang: 'de',
    planner: false,
    zuteiler: false,
    personId: 'p-simon',
    persons: [person('p-simon', 'Simon', 'Krüger'), person('p-jonas', 'Jonas', 'Berger')],
    services: [{ key: 'mik', name: 'Mikrofone', count: 1 }],
    weeks: [woche(W1, 'Simon Krüger', 'p-simon'), woche(W2, 'Jonas Berger', 'p-jonas')],
    sentLog: { [`${A} Simon Krüger`]: '2026-09-01T10:00:00Z', [`${B} Jonas Berger`]: '2026-09-01T10:00:00Z' },
    absences: [],
    myTasks: [AUFGABE],
    tauschAnfragen: [],
    staleAt: null,
    congregation: { name: 'Nordheim', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
}

const ANFRAGE: TauschAnfrage = { id: 'a1', von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13' }

function zeige(knoten: ReactNode, state: AppState) {
  const dispatch = vi.fn()
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>{knoten}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-07T09:00:00'))
  // Das Blatt fragt nach der Breite (Ziehen zum Schließen am Handy); jsdom kennt sie nicht.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('„Tauschen" an der eigenen Aufgabe', () => {
  it('steht neben „Ich kann nicht" und öffnet das Blatt', () => {
    const { dispatch } = zeige(<AufgabeHandlungen task={AUFGABE} />, zustand())
    expect(knopf(t.kannNicht)).toBeTruthy()
    fireEvent.click(knopf(t.tauschAktion)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openTausch', id: A })
  })

  it('nicht an einem Programmpunkt, nicht vor „Plan senden", nicht offline', () => {
    zeige(<AufgabeHandlungen task={{ ...AUFGABE, id: `${W1}|we|part|v1|0` }} />, zustand())
    expect(knopf(t.tauschAktion)).toBeUndefined()
    cleanup()
    zeige(<AufgabeHandlungen task={AUFGABE} />, zustand({ sentLog: {} }))
    expect(knopf(t.tauschAktion)).toBeUndefined()
    cleanup()
    zeige(<AufgabeHandlungen task={AUFGABE} />, zustand({ staleAt: Date.now() }))
    expect(knopf(t.tauschAktion)).toBeUndefined()
  })

  it('läuft eine Anfrage, steht darunter, bei wem', () => {
    zeige(<AufgabeHandlungen task={AUFGABE} />, zustand({ tauschAnfragen: [ANFRAGE] }))
    expect(screen.getByText(fill(t.tauschAngefragtBei, { name: 'Jonas Berger' }))).toBeTruthy()
  })
})

describe('Das Tausch-Blatt', () => {
  it('nennt, was man abgibt, und wen man fragen kann — „Anfragen" legt die Anfrage an', async () => {
    const konto = { userId: 'u-jonas', email: '', personId: 'p-jonas', planner: false, zuteiler: false }
    const { dispatch } = zeige(<TauschenBlatt task={AUFGABE} />, zustand({ members: [konto] }))
    expect(screen.getByText(t.tauschGibstAb)).toBeTruthy()
    expect(await screen.findByText('Jonas Berger')).toBeTruthy()
    expect(screen.getByText(/Mikrofone · .*20\.\sSeptember · 10:00/)).toBeTruthy()
    fireEvent.click(knopf(t.tauschAnfragen)!)
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'tauschAngefragt',
        anfrage: expect.objectContaining({ von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13' }),
      }),
    )
  })

  it('kann niemand, sagt es das — wer am anderen Tag fehlt, steht nicht da', async () => {
    const fehlt = [{ id: 'x', personId: 'p-simon', userId: null, from: '2026-09-20', to: '2026-09-20', reason: '' }]
    zeige(<TauschenBlatt task={AUFGABE} />, zustand({ absences: fehlt }))
    expect(await screen.findByText(t.tauschNiemand)).toBeTruthy()
    expect(screen.queryByText('Jonas Berger')).toBeNull()
  })

  it('wer kein Konto hat, steht auch da — „Tauschen" fragt erst „Abgesprochen?", dann wird gleich getauscht (30.10.2026)', async () => {
    // Ohne Datenbank kennt die App die Konten aus den geladenen Mitgliedern: Jonas hat keines.
    const { dispatch } = zeige(<TauschenBlatt task={AUFGABE} />, zustand({ members: [] }))
    expect(await screen.findByText('Jonas Berger')).toBeTruthy()
    expect(screen.getByText(t.tauschOhneKonto)).toBeTruthy()
    expect(screen.getByText(t.tauschHinweisOhneKonto)).toBeTruthy()
    expect(knopf(t.tauschAnfragen)).toBeUndefined()
    // Der erste Tipp schärft nur — getauscht ist noch nichts.
    fireEvent.click(knopf(t.tauschAktion)!)
    expect(knopf(t.tauschDirektSicher)).toBeTruthy()
    expect(dispatch).not.toHaveBeenCalled()
    bestaetigen(knopf(t.tauschDirektSicher))
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'getauscht',
        tausch: { von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B },
        ohneKonto: true,
      }),
    )
  })

  it('wer ein Konto hat, wird angefragt — ohne den Hinweis', async () => {
    const konto = { userId: 'u-jonas', email: '', personId: 'p-jonas', planner: false, zuteiler: false }
    zeige(<TauschenBlatt task={AUFGABE} />, zustand({ members: [konto] }))
    expect(await screen.findByText('Jonas Berger')).toBeTruthy()
    expect(knopf(t.tauschAnfragen)).toBeTruthy()
    expect(screen.queryByText(t.tauschOhneKonto)).toBeNull()
    expect(screen.queryByText(t.tauschHinweisOhneKonto)).toBeNull()
  })

  it('läuft eine Anfrage, steht dort, bei wem — und „Zurückziehen" beendet sie', async () => {
    const { dispatch } = zeige(<TauschenBlatt task={AUFGABE} />, zustand({ tauschAnfragen: [ANFRAGE] }))
    expect(screen.getByText(fill(t.tauschAngefragtBei, { name: 'Jonas Berger' }))).toBeTruthy()
    expect(knopf(t.tauschAnfragen)).toBeUndefined()
    fireEvent.click(knopf(t.tauschZurueckziehen)!)
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'tauschWeg', id: 'a1' }))
  })
})

describe('Die Anfrage beim Gefragten', () => {
  const beiJonas = (over: Partial<AppState> = {}) => zustand({ personId: 'p-jonas', myTasks: [], tauschAnfragen: [ANFRAGE], ...over })

  it('wer fragt, was ich abgebe, was ich dafür übernehme', () => {
    zeige(<TauschAnfragen />, beiJonas())
    expect(screen.getByText(fill(t.tauschFragtDich, { name: 'Simon Krüger' }))).toBeTruthy()
    const paar = document.querySelector('.tausch-paar')!.textContent ?? ''
    // `\s`: Tag und Monat sind gebunden (geschütztes Leerzeichen, `zahlBinden`).
    expect(paar).toMatch(new RegExp(`${t.tauschGibstAb}Mikrofone · .*20\\.\\sSeptember`))
    expect(paar).toMatch(new RegExp(`${t.tauschUebernimmst}Mikrofone · .*13\\.\\sSeptember`))
  })

  it('„Tauschen" tauscht, „Nein, danke" beendet die Anfrage', async () => {
    const { dispatch } = zeige(<TauschAnfragen />, beiJonas())
    fireEvent.click(knopf(t.tauschAktion)!)
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'getauscht', tausch: ANFRAGE }))
    fireEvent.click(knopf(t.tauschNeinDanke)!)
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'tauschWeg', id: 'a1' }))
  })

  it('nur beim Gefragten, nicht offline, und nicht mehr nach dem früheren Tag', () => {
    zeige(<TauschAnfragen />, zustand())
    expect(document.querySelector('.tausch-karte')).toBeNull()
    cleanup()
    zeige(<TauschAnfragen />, beiJonas({ staleAt: Date.now() }))
    expect(document.querySelector('.tausch-karte')).toBeNull()
    cleanup()
    vi.setSystemTime(new Date('2026-09-14T09:00:00'))
    zeige(<TauschAnfragen />, beiJonas())
    expect(document.querySelector('.tausch-karte')).toBeNull()
  })
})
