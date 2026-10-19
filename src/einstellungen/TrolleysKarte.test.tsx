/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Die Trolleys der Versammlung** (T121, Phase 7, Entwürfe
 * `GGruppenStandorte`, `GTrolley`, `GDesktopEinstellungen`): je Trolley, wo
 * man ihn abholt und wie viele Termine anstehen, und je Trolley ein Blatt —
 * Name, Ort, Hinweis, was beim Entfernen mitgeht.
 *
 * Entfernt wird über die Function `trolley` (hier nachgestellt): Sie sagt den
 * Eingetragenen Bescheid. Erst ihre Antwort nimmt den Trolley aus dem Zustand.
 * Die Uhr steht auf Montag, 7. September 2026.
 */
const trolley = vi.hoisted(() => ({
  trolleyEintragen: vi.fn(),
  trolleyDazukommen: vi.fn(),
  trolleyAustragen: vi.fn(),
  trolleyEntfernen: vi.fn(),
}))
vi.mock('../lib/trolley', () => trolley)
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_TROLLEY_TERMINE, DEMO_TROLLEYS } from '../../tests/testdaten/testdaten'
import { dict } from '../i18n/ui'
import { TrolleysKarte } from './TrolleysKarte'

const t = dict('de')

function zeige(over: Partial<AppState> = {}, tabelle = false) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    trolleys: DEMO_TROLLEYS, trolleyTermine: DEMO_TROLLEY_TERMINE,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <TrolleysKarte tabelle={tabelle} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9))
  // Das Blatt lässt sich nach unten wegwischen; die Geste fragt nach dem Schreibtisch.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  for (const fn of Object.values(trolley)) fn.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

const zeilen = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.einst-zeile')]
const knopf = (wo: ParentNode, text: string) =>
  [...wo.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const feld = (marke: string) =>
  [...blatt().querySelectorAll('.blatt-feld')]
    .find((f) => f.querySelector('.feld-marke')?.textContent === marke)!
    .querySelector('input')!
/** Das Blatt von Trolley 3: abholen im Königreichssaal, drei kommende Termine. */
const oeffne = (over: Partial<AppState> = {}) => {
  const z = zeige(over)
  fireEvent.click(zeilen(z.container)[2]!)
  return z
}
const aenderungen = (d: ReturnType<typeof vi.fn>) => d.mock.calls.filter((c) => c[0].type === 'trolleyAendern').map((c) => c[0])

describe('Die Liste', () => {
  it('jeder Trolley nennt, wo man ihn abholt und wie viele Termine anstehen — nach dem Namen geordnet', () => {
    const { container } = zeige({ trolleys: [...DEMO_TROLLEYS].reverse() })
    expect(
      zeilen(container).map((z) => [
        z.querySelector('.einst-zeile-name')?.textContent,
        z.querySelector('.klein-text')?.textContent,
        z.querySelector('.einst-zeile-wert')?.textContent,
      ]),
    ).toEqual([
      ['Trolley 1', 'abholen: Depot', zahlBinden('Termine: 2')],
      // Einer davon heute, am Nachmittag — heute zählt mit.
      ['Trolley 2', 'abholen: Depot', zahlBinden('Termine: 2')],
      ['Trolley 3', 'abholen: Königreichssaal', zahlBinden('Termine: 3')],
    ])
  })

  it('vergangene Termine zählen nicht mit', () => {
    const vorbei = { ...DEMO_TROLLEY_TERMINE[0]!, id: 'alt', datum: '2026-09-05' }
    const { container } = zeige({ trolleyTermine: [vorbei] })
    expect(zeilen(container)[0]!.querySelector('.einst-zeile-wert')?.textContent).toBe(zahlBinden('Termine: 0'))
  })

  it('am Desktop als Tabelle: Trolley, Abholen, Hinweis, kommende Termine', () => {
    const { container } = zeige({}, true)
    expect([...container.querySelectorAll('.einst-tabelle-kopf span')].map((s) => s.textContent)).toEqual([
      t.privZeugnis, t.trolleyOrtKopf, t.trolleyHinweisKopf, t.trolleyKommende,
    ])
    const zeile = container.querySelectorAll('.einst-tabelle-zeile')[2]!
    expect([...zeile.querySelectorAll(':scope > span')].map((s) => s.textContent)).toEqual([
      'Trolley 3', 'Königreichssaal', 'Schlüssel im Fach neben der Bühne', '3',
    ])
  })
})

describe('Trolley hinzufügen', () => {
  const neu = (d: ReturnType<typeof vi.fn>) => d.mock.calls.find((c) => c[0].type === 'trolleyAnlegen')![0].trolley

  it('legt ihn gleich an, mit der nächsten Nummer — die Kennung vergibt der Client', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.trolleyHinzu))
    expect(neu(dispatch)).toMatchObject({ name: 'Trolley 4', ort: '', hinweis: '' })
    expect(neu(dispatch).id).toMatch(/^t[0-9a-f-]{36}$/)
  })

  it('der Name in der Sprache des Admins', () => {
    const { container, dispatch } = zeige({ trolleys: [], lang: 'en' })
    fireEvent.click(knopf(container, dict('en').trolleyHinzu))
    expect(neu(dispatch).name).toBe(`${dict('en').privZeugnis} 1`)
  })
})

describe('Das Blatt: Name, Ort und Hinweis gelten beim Schließen', () => {
  it('Tippen schreibt nichts — „Fertig" übernimmt, was sich geändert hat', () => {
    const { dispatch } = oeffne()
    fireEvent.change(feld(t.trolleyOrtLbl), { target: { value: '  Depot  ' } })
    fireEvent.change(feld(t.trolleyHinweisLbl), { target: { value: '' } })
    expect(aenderungen(dispatch)).toEqual([])
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(aenderungen(dispatch)).toEqual([{ type: 'trolleyAendern', id: 'tr3', patch: { ort: 'Depot', hinweis: '' } }])
  })

  it('wer nichts anfasst, schreibt nichts', () => {
    const { dispatch } = oeffne()
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(aenderungen(dispatch)).toEqual([])
  })

  it('leer bleibt der alte Name — und ein Hinweis sagt warum', () => {
    const { dispatch } = oeffne()
    fireEvent.change(feld(t.nameLbl), { target: { value: '   ' } })
    expect(blatt().querySelector('[role="alert"]')?.textContent).toBe(t.toastNameLeer)
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(aenderungen(dispatch)).toEqual([])
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameLeer })
  })

  it('doppelt bleibt der alte Name — was sonst geändert ist, gilt trotzdem', () => {
    const { dispatch } = oeffne()
    fireEvent.change(feld(t.nameLbl), { target: { value: ' trolley  2 ' } })
    fireEvent.change(feld(t.trolleyOrtLbl), { target: { value: 'Depot' } })
    const hinweis = zahlBinden('Name nicht geändert: Trolley 2 gibt es schon')
    expect(blatt().querySelector('[role="alert"]')?.textContent).toBe(hinweis)
    expect(feld(t.nameLbl).getAttribute('aria-invalid')).toBe('true')
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(aenderungen(dispatch)).toEqual([{ type: 'trolleyAendern', id: 'tr3', patch: { ort: 'Depot' } }])
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: hinweis })
  })

  it('ein neuer Name, getrimmt', () => {
    const { dispatch } = oeffne()
    fireEvent.change(feld(t.nameLbl), { target: { value: '  Saal-Trolley ' } })
    fireEvent.click(knopf(blatt(), t.fertig))
    expect(aenderungen(dispatch)).toEqual([{ type: 'trolleyAendern', id: 'tr3', patch: { name: 'Saal-Trolley' } }])
  })
})

describe('Das Blatt: kommende Termine und Entfernen', () => {
  const folgen = () => [...blatt().querySelectorAll('.blatt-folgen p')].map((p) => p.textContent)

  it('nennt die kommenden Termine — ein Tipp führt zu den Trolleys', () => {
    const { dispatch } = oeffne()
    const zeile = zeilen(blatt()).find((z) => z.querySelector('.einst-zeile-name')?.textContent === t.trolleyKommende)!
    expect(zeile.querySelector('.einst-zeile-wert')?.textContent).toBe('3')
    fireEvent.click(zeile)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'trolleys' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })

  it('vorher steht da, was verloren geht: die kommenden Termine — und wer eingetragen ist, erfährt es', () => {
    oeffne()
    expect(folgen()).toEqual([t.trolleyDelTermine, t.trolleyDelBescheid])
  })

  it('ohne kommende Termine: keine erfundenen Folgen', () => {
    oeffne({ trolleyTermine: [] })
    expect(blatt().querySelector('.blatt-folgen')).toBeNull()
  })

  it('der erste Tipp fragt; erst der zweite entfernt — über die Function, dann aus dem Zustand', async () => {
    trolley.trolleyEntfernen.mockResolvedValue({ ok: true })
    const { dispatch } = oeffne()
    fireEvent.click(knopf(blatt(), t.trolleyEntfernen))
    expect(trolley.trolleyEntfernen).not.toHaveBeenCalled()
    await act(async () => {
      bestaetigen(knopf(blatt(), t.loeschenSicher))
    })
    expect(trolley.trolleyEntfernen).toHaveBeenCalledWith('tr3', '2026-09-07')
    expect(dispatch).toHaveBeenCalledWith({ type: 'trolleyEntfernt', id: 'tr3' })
  })

  it('ist er schon fort, ist das so gut wie entfernt', async () => {
    trolley.trolleyEntfernen.mockResolvedValue({ ok: false, fehler: 'weg' })
    const { dispatch } = oeffne()
    fireEvent.click(knopf(blatt(), t.trolleyEntfernen))
    await act(async () => {
      bestaetigen(knopf(blatt(), t.loeschenSicher))
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'trolleyEntfernt', id: 'tr3' })
  })

  it('ohne Verbindung bleibt er — und das Blatt sagt warum', async () => {
    trolley.trolleyEntfernen.mockResolvedValue({ ok: false, fehler: 'netz' })
    const { dispatch } = oeffne()
    fireEvent.click(knopf(blatt(), t.trolleyEntfernen))
    await act(async () => {
      bestaetigen(knopf(blatt(), t.loeschenSicher))
    })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'trolleyEntfernt', id: 'tr3' })
    expect(blatt().querySelector('[role="alert"]')?.textContent).toBe(t.trolleyFehlerNetz)
  })
})
