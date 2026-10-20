/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'

/**
 * **Die Trolleys im Predigtdienst** (T121, Phase 7; Entwürfe `GZeugnis`,
 * `GDesktopTrolleys`) — was dasteht und was ein Tipp auslöst.
 *
 * Geschrieben wird über die Function (`lib/trolley.ts`, hier nachgestellt);
 * die Ansicht legt deren Antwort in den Zustand (`trolleyTermin`) und nennt
 * den Grund, wenn sie scheitert. Die Uhr steht auf Montag, 7. September 2026;
 * Simon (p9) ist angemeldet und darf mit dem Trolley gehen.
 */
const trolley = vi.hoisted(() => ({
  trolleyEintragen: vi.fn(),
  trolleyDazukommen: vi.fn(),
  trolleyAustragen: vi.fn(),
  trolleyEntfernen: vi.fn(),
}))
vi.mock('../lib/trolley', () => trolley)
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))

import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_TROLLEY_PERSONEN, DEMO_TROLLEY_TERMINE, DEMO_TROLLEYS } from '../../tests/testdaten/testdaten'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { TrolleyTermin } from '../data/types'
import { loadAndHydrate } from '../app/hydrate'
import { TrolleyAnsicht } from './TrolleyAnsicht'
import { zahlBinden } from '../i18n/zahl-binden'

const t = dict('de')

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const demo = demoZustand()
  const state: AppState = {
    ...demo,
    dataStatus: 'ready',
    personId: 'p9',
    persons: demo.persons.map((p) => (DEMO_TROLLEY_PERSONEN.includes(p.id) ? { ...p, priv: { ...p.priv, zeugnis: true } } : p)),
    trolleys: DEMO_TROLLEYS,
    trolleyTermine: DEMO_TROLLEY_TERMINE,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <TrolleyAnsicht />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const breit = (an: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: an, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia
}
const karte = (c: HTMLElement, titel: string) =>
  [...c.querySelectorAll<HTMLElement>('.trolley-karte')].find((k) => k.querySelector('.karte-titel')?.textContent === titel)
const knopf = (c: Element, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)
const tag = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('.trolley-tagknopf')].find((b) => b.getAttribute('aria-label')?.startsWith(name))!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9))
  breit(false)
  for (const fn of Object.values(trolley)) fn.mockReset()
  vi.mocked(loadAndHydrate).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('oben: die eigenen Termine und wer einen Partner sucht', () => {
  it('Simons Termin — mit wem, und dass Jonas beide eingetragen hat', () => {
    const { container } = zeige()
    const deine = karte(container, t.trolleyDeineTermine)!
    expect(deine.textContent).toContain('Trolley 3')
    expect(deine.textContent).toContain(fill(t.trolleyMit, { name: 'Jonas Berger' }))
    expect(deine.textContent).toContain(fill(t.trolleyBeideEingetragen, { name: 'Jonas' }))
  })

  it('Jonas sucht einen Partner — „Dazukommen" trägt Simon ein und legt die Antwort in den Zustand', async () => {
    const neu: TrolleyTermin = { ...DEMO_TROLLEY_TERMINE[1]!, partner: 'p9' }
    trolley.trolleyDazukommen.mockResolvedValue({ ok: true, termin: neu })
    const { container, dispatch } = zeige()
    const gesucht = karte(container, t.trolleyPartnerGesucht)!
    expect(gesucht.textContent).toContain('Jonas Berger')
    await act(async () => {
      fireEvent.click(knopf(gesucht, t.trolleyDazukommen)!)
    })
    expect(trolley.trolleyDazukommen).toHaveBeenCalledWith(DEMO_TROLLEY_TERMINE[1], 'p9', '2026-09-07')
    expect(dispatch).toHaveBeenCalledWith({ type: 'trolleyTermin', id: neu.id, termin: neu, toast: 'dazu' })
  })

  it('scheitert es, sagt ein Toast warum — und war jemand schneller, lädt die App still nach', async () => {
    trolley.trolleyDazukommen.mockResolvedValue({ ok: false, fehler: 'schon-partner' })
    const { container, dispatch } = zeige({ userId: 'u1' })
    await act(async () => {
      fireEvent.click(knopf(karte(container, t.trolleyPartnerGesucht)!, t.trolleyDazukommen)!)
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.trolleyFehlerSchonPartner })
    expect(loadAndHydrate).toHaveBeenCalledWith(dispatch, 'u1', { silent: true })
  })

  it('im Offline-Stand geht nichts hinaus — die Function bliebe am Reducer vorbei', async () => {
    const { container, dispatch } = zeige({ staleAt: Date.now() })
    await act(async () => {
      fireEvent.click(knopf(karte(container, t.trolleyPartnerGesucht)!, t.trolleyDazukommen)!)
    })
    expect(trolley.trolleyDazukommen).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.offlineReadOnly })
  })

  it('ohne Verbindung lädt sie nicht nach — es gibt keinen neueren Stand', async () => {
    trolley.trolleyDazukommen.mockResolvedValue({ ok: false, fehler: 'netz' })
    const { container } = zeige({ userId: 'u1' })
    await act(async () => {
      fireEvent.click(knopf(karte(container, t.trolleyPartnerGesucht)!, t.trolleyDazukommen)!)
    })
    expect(loadAndHydrate).not.toHaveBeenCalled()
  })

  it('ohne Trolley-Recht: die Zeile ohne „Dazukommen", und statt „Eintragen" der Hinweis', () => {
    const { container } = zeige({ personId: 'p11' })
    expect(knopf(karte(container, t.trolleyPartnerGesucht)!, t.trolleyDazukommen)).toBeUndefined()
    expect(knopf(container, t.trolleyEintragen)).toBeUndefined()
    expect(container.textContent).toContain(t.trolleyFehlerKeinRecht)
  })
})

describe('am Handy: ein Tag mit einer Spalte je Trolley', () => {
  it('der Samstag zeigt seine beiden Termine, je mit Zeit und Namen für Vorleseprogramme', () => {
    const { container } = zeige()
    fireEvent.click(tag(container, 'Samstag'))
    const bloecke = [...container.querySelectorAll('.trolley-termin')].map((b) => b.getAttribute('aria-label'))
    expect(bloecke).toEqual([
      fill(t.trolleyTerminLabel, { trolley: 'Trolley 1', zeit: '09:00–11:00', wer: fill(t.trolleyUnd, { a: 'Georg Peters', b: 'Claus Maier' }) }),
      fill(t.trolleyTerminLabel, { trolley: 'Trolley 3', zeit: '09:30–12:00', wer: fill(t.trolleyUnd, { a: 'Helmut Vogel', b: 'Konrad Sommer' }) }),
    ])
  })

  it('Name und Ort über den Spalten trennen nach der Sprache der Versammlung, nicht der des Lesers (T128)', () => {
    // In einer englischen App mit deutscher Versammlung brach „Königreic|hssaal" ohne Strich.
    const { container } = zeige({ lang: 'en', congLang: 'de' })
    const koepfe = [...container.querySelectorAll('.trolley-tag-kopf .trolley-spaltenkopf')]
    expect(koepfe).toHaveLength(3)
    for (const kopf of koepfe) expect(kopf.getAttribute('lang')).toBe('de')
  })

  it('wer einen Partner sucht, steht gestrichelt da', () => {
    const { container } = zeige()
    fireEvent.click(tag(container, 'Mittwoch'))
    expect(container.querySelector('.trolley-termin.is-gesucht')?.textContent).toContain(t.trolleyPartnerGesucht)
  })

  it('ein Punkt unter den Tagen mit Terminen — und vorlesbar', () => {
    const { container } = zeige()
    expect(tag(container, 'Mittwoch').getAttribute('aria-label')).toContain(fill(t.trolleyTagMitTerminen, { tag: '' }).trim())
    expect(tag(container, 'Dienstag').querySelector('.is-belegt')).toBeNull()
  })

  it('„Eintragen" öffnet das Blatt — der Grund, der im Weg steht, steht schon vor dem Absenden da', () => {
    const { container } = zeige()
    fireEvent.click(tag(container, 'Samstag'))
    fireEvent.click(knopf(container, t.trolleyEintragen)!)
    const blatt = document.querySelector('[role="dialog"]')!
    // 10–12 Uhr auf Trolley 1: Georg und Claus sind dort bis 11.
    expect(blatt.textContent).toContain(t.trolleyFehlerBelegt)
    expect(knopf(blatt.querySelector('.sheet-fuss-ende')!, t.trolleyEintragen)?.getAttribute('aria-disabled')).toBe('true')
  })

  it('ein Tipp auf einen Termin öffnet ihn — mit „Austragen" für den, der dabei ist', async () => {
    trolley.trolleyAustragen.mockResolvedValue({ ok: true, termin: { ...DEMO_TROLLEY_TERMINE[5]!, partner: null } })
    const { container } = zeige()
    fireEvent.click(karte(container, t.trolleyDeineTermine)!.querySelector('.trolley-zeile')!)
    const blatt = document.querySelector('[role="dialog"]')!
    expect(blatt.textContent).toContain(fill(t.trolleyAbholen, { ort: 'Königreichssaal' }))
    expect(blatt.textContent).toContain('Schlüssel im Fach neben der Bühne')
    fireEvent.click(knopf(blatt, t.trolleyAustragen)!)
    await act(async () => {
      bestaetigen(knopf(blatt, t.entfernenSicher)!)
    })
    expect(trolley.trolleyAustragen).toHaveBeenCalledWith(DEMO_TROLLEY_TERMINE[5], 'p9', '2026-09-07')
  })
})

describe('am Desktop: die Woche als Raster, das Formular rechts', () => {
  beforeEach(() => breit(true))

  it('sieben Tage, je Trolley eine Spalte — und das Formular steht schon da', () => {
    const { container } = zeige()
    expect(container.querySelectorAll('.trolley-woche-zeile')).toHaveLength(7)
    expect(container.querySelectorAll('.trolley-woche-kopf .trolley-spaltenkopf')).toHaveLength(3)
    expect(container.querySelector('aside.trolley-seite')).not.toBeNull()
  })

  it('Name und Ort über einer Spalte trennen nach der Sprache der Versammlung, der Satz drumherum nicht (T128)', () => {
    // In einer englischen App brach „Königreichss|aal" ohne Strich.
    const { container } = zeige({ lang: 'en', congLang: 'de' })
    const koepfe = [...container.querySelectorAll('.trolley-woche-kopf .trolley-spaltenkopf')]
    expect(koepfe).toHaveLength(3)
    for (const kopf of koepfe) expect(kopf.querySelector('.trolley-spaltenkopf-name')?.getAttribute('lang')).toBe('de')
    const abholen = koepfe.map((kopf) => kopf.querySelector('.klein-text')).find((x) => x !== null)!
    const ort = abholen.querySelector('[lang]')!
    expect(ort.getAttribute('lang')).toBe('de')
    expect(abholen.textContent).toBe(fill(dict('en').trolleyAbholen, { ort: ort.textContent ?? '' }))
    expect(abholen.getAttribute('lang')).toBeNull()
  })

  it('ohne Trolley-Recht kein Formular und keine freien Felder — aber der Hinweis, warum', () => {
    const { container } = zeige({ personId: 'p11' })
    expect(container.querySelector('aside.trolley-seite')).toBeNull()
    expect(container.querySelector('.trolley-woche-frei')).toBeNull()
    expect(container.textContent).toContain(t.trolleyFehlerKeinRecht)
  })

  it('ein Klick in ein freies Feld setzt Tag und Trolley ins Formular', () => {
    const { container } = zeige()
    const frei = [...container.querySelectorAll<HTMLButtonElement>('.trolley-woche-frei')].find((b) => {
      const label = b.getAttribute('aria-label') ?? ''
      return label.startsWith('Donnerstag') && label.includes('Trolley 2')
    })!
    fireEvent.click(frei)
    const seite = container.querySelector('aside.trolley-seite')!
    const zehnter = zahlBinden('10. Sept. 2026')
    expect(seite.querySelector('.dp-field')?.textContent).toBe(zehnter)
    expect(knopf(seite, 'Trolley 2')?.getAttribute('aria-pressed')).toBe('true')
  })
})

/**
 * **Drucken für den Aushang** (T121, Phase 9; Entwurf `GDruckTrolleys`): zwei
 * Wochen ab der angezeigten, je Tag eine Zeile, je Trolley eine Spalte.
 */
describe('Drucken', () => {
  it('der Knopf druckt den Bogen der Trolleys — ab der angezeigten Woche', () => {
    let imDruck = { kennzeichen: undefined as string | undefined, zeitraum: '', tage: 0 }
    window.print = vi.fn(() => {
      imDruck = {
        kennzeichen: document.documentElement.dataset.print,
        zeitraum: document.querySelector('.druck-bogen .druck-zeitraum')?.textContent ?? '',
        tage: document.querySelectorAll('.druck-bogen .druck-trolley-tag').length,
      }
    })
    const { container } = zeige()
    fireEvent.click(container.querySelector('.druck-knopf')!)
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(imDruck).toEqual({ kennzeichen: 'bogen', zeitraum: zahlBinden('7.–20. September 2026'), tage: 14 })
    delete document.documentElement.dataset.print
  })
})
