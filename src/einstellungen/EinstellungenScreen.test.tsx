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
import type { Person } from '../data/types'
import { dict } from '../i18n/ui'
import { EinstellungenScreen } from './EinstellungenScreen'

/**
 * **Die Einstellungen** (T121, Phase 6c, Entwürfe `GEinstellungen` und
 * `GDesktopEinstellungen`): am Handy Karten mit Zeilen, ein Tipp öffnet ein
 * Blatt oder eine Unteransicht; am Desktop links die Abschnitte, rechts der
 * gewählte. Geprüft wird, was der Admin damit tut — einen Wert finden und
 * ändern —, nicht, wie die Zeilen gebaut sind.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: vi.fn() }))

const t = dict('de')

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(), grp: null, ...over,
})

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'einstellungen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: true,
    persons: [person('p-a', 'Anna', 'Aal'), person('p-b', 'Bernd', 'Berg')],
    members: [{ userId: 'u1', email: '', personId: 'p-a', planner: true, zuteiler: false }],
    groups: [{ id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }],
    services: [], weeks: [], fsWeeks: [], fsRules: [], absences: [],
    congLang: 'de', progLangs: ['en'],
    reminders: { first: 7, last: 0, repeat: true },
    congregation: { name: 'Nordheim', hall: 'Am Saal 1', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <EinstellungenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/** Am Desktop (ab 1180 px) oder am Handy — jsdom kennt `matchMedia` nicht. */
const breite = (desktop: boolean) => {
  window.matchMedia = vi.fn((q: string) => ({
    matches: desktop || !q.includes('1180'),
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

const titel = (c: HTMLElement) => [...c.querySelectorAll('.karte-titel')].map((h) => h.textContent)
/** Eine Zeile, erkannt an ihrem Namen. */
const zeile = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('.einst-zeile')].find((z) => z.querySelector('.einst-zeile-name')?.textContent === name)
const wert = (c: HTMLElement, name: string) => zeile(c, name)?.querySelector('.einst-zeile-wert')?.textContent
/** Das Blatt mit diesem Titel — es liegt am Dokument, nicht im Bildschirm. */
const blatt = (titelText: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${titelText}"]`)
const feld = (wo: HTMLElement, marke: string) =>
  [...wo.querySelectorAll<HTMLSelectElement>('select')].find((s) => s.previousElementSibling?.textContent === marke)!
const patches = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => c[0].type === 'updateCongregation').map((c) => c[0].patch)

beforeEach(() => breite(false))
afterEach(() => {
  cleanup()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('Die Übersicht am Handy', () => {
  it('die Karten in der Folge des Entwurfs', () => {
    const { container } = zeige()
    expect(titel(container)).toEqual([
      t.versammlungCard, t.navZusammenkuenfte, t.tabFs, t.mitteilungen, t.werPlant, t.importCard,
    ])
  })

  it('jede Zeile nennt ihren Wert — man sieht, was gilt, ohne zu öffnen', () => {
    const { container } = zeige()
    expect(wert(container, t.nameLbl)).toBe('Nordheim')
    expect(wert(container, t.saal)).toBe('Am Saal 1')
    expect(wert(container, t.unterDerWoche)).toBe('Dienstag 19:00')
    expect(wert(container, t.amWochenende)).toBe('Sonntag 10:00')
    expect(wert(container, t.gruppenTitel)).toBe('1')
    expect(zeile(container, t.erinnerungenCard)?.querySelector('.klein-text')?.textContent).toBe(
      'Erste 7 Tage vorher, letzte am Tag',
    )
  })

  it('die Programmsprachen: erst die der Versammlung, dann die weiteren', () => {
    const { container } = zeige({ congLang: 'de', progLangs: ['en'] })
    expect(wert(container, t.programmsprachen)).toBe('Deutsch, Englisch')
  })
})

describe('Name und Königreichssaal', () => {
  it('ein Tipp öffnet ein Blatt mit dem Feld, und was man tippt, gilt sofort', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(zeile(container, t.nameLbl)!)
    const name = blatt(t.nameLbl)!.querySelector<HTMLInputElement>('input')!
    expect(name.value).toBe('Nordheim')
    fireEvent.change(name, { target: { value: 'Südheim' } })
    expect(patches(dispatch)).toEqual([{ name: 'Südheim' }])
  })

  it('der Saal hat sein eigenes Blatt — und schreibt nur die Anschrift', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(zeile(container, t.saal)!)
    fireEvent.change(blatt(t.saal)!.querySelector('input')!, { target: { value: 'Saalweg 2' } })
    expect(patches(dispatch)).toEqual([{ hall: 'Saalweg 2' }])
  })

  it('beide stehen in ihrer eigenen Schreibrichtung — sie gehören der Versammlung', () => {
    const { container } = zeige()
    expect(zeile(container, t.nameLbl)?.querySelector('.einst-zeile-wert')?.getAttribute('dir')).toBe('auto')
    fireEvent.click(zeile(container, t.saal)!)
    expect(blatt(t.saal)!.querySelector('input')?.getAttribute('dir')).toBe('auto')
  })
})

describe('Wann die Zusammenkünfte sind', () => {
  const oeffne = (c: HTMLElement, name: string) => {
    fireEvent.click(zeile(c, name)!)
    return blatt(name)!
  }

  it('je Zusammenkunft ein Blatt mit Wochentag und Uhrzeit', () => {
    const { container } = zeige()
    const mitte = oeffne(container, t.unterDerWoche)
    expect(feld(mitte, t.a11yWeekday).value).toBe('2')
    expect(feld(mitte, t.a11yTime).value).toBe('19:00')
  })

  it('die Tage stehen in der Sprache des Lesers ab Montag, gespeichert wird die Zahl', () => {
    const { container } = zeige()
    const optionen = [...feld(oeffne(container, t.unterDerWoche), t.a11yWeekday).querySelectorAll('option')]
    expect(optionen.map((o) => o.textContent)).toEqual([
      'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
    ])
    expect(optionen.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '0'])
  })

  it('ein neuer Tag der Wochenmitte lässt das Wochenende unangetastet', () => {
    // Beide Termine stehen in EINEM Feld (`times`) — wird der Rest nicht
    // mitgeschrieben, ist er weg.
    const { container, dispatch } = zeige()
    fireEvent.change(feld(oeffne(container, t.unterDerWoche), t.a11yWeekday), { target: { value: '4' } })
    expect(patches(dispatch)).toEqual([{ times: { mid: { wd: 4, time: '19:00' }, we: { wd: 0, time: '10:00' } } }])
  })

  it('und eine neue Uhrzeit am Wochenende die Wochenmitte ebenso', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(feld(oeffne(container, t.amWochenende), t.a11yTime), { target: { value: '09:30' } })
    expect(patches(dispatch)).toEqual([{ times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '09:30' } } }])
  })

  it('eine krumme Bestandszeit bleibt wählbar — sonst spränge sie beim Öffnen um', () => {
    const { container } = zeige({
      congregation: { name: 'N', hall: 'S', times: { mid: { wd: 2, time: '19:20' }, we: { wd: 0, time: '10:00' } } },
    })
    expect(feld(oeffne(container, t.unterDerWoche), t.a11yTime).value).toBe('19:20')
  })
})

describe('Zusätzliche Klasse (S-38 Abs. 27)', () => {
  const schalter = (c: HTMLElement) => c.querySelector('.einst-schalter [role="switch"]')!

  it('ein Schalter der Versammlung, mit dem Zweck darunter', () => {
    const { container } = zeige({ auxClass: false })
    expect(schalter(container).getAttribute('aria-checked')).toBe('false')
    expect(container.querySelector('.einst-schalter .klein-text')?.textContent).toBe(t.auxKurz)
  })

  it('ein Tipp schaltet sie ein, ein weiterer aus', () => {
    const { container, dispatch } = zeige({ auxClass: false })
    fireEvent.click(schalter(container))
    expect(dispatch).toHaveBeenCalledWith({ type: 'setAuxClass', on: true })
    cleanup()
    const zweiter = zeige({ auxClass: true })
    fireEvent.click(schalter(zweiter.container))
    expect(zweiter.dispatch).toHaveBeenCalledWith({ type: 'setAuxClass', on: false })
  })
})

describe('Wer plant', () => {
  const karte = (c: HTMLElement) =>
    [...c.querySelectorAll('.einst-karte')].find((k) => k.querySelector('.karte-titel')?.textContent === t.werPlant)!

  it('nennt alle, die planen dürfen, und die Admins — als einen Satz', () => {
    const { container } = zeige({
      members: [
        { userId: 'u1', email: '', personId: 'p-a', planner: true, zuteiler: false },
        { userId: 'u2', email: '', personId: 'p-b', planner: false, zuteiler: true },
      ],
    })
    expect(karte(container).querySelector('.einst-namen')?.textContent).toBe('Anna Aal und Bernd Berg')
  })

  it('ohne jemanden sagt sie es', () => {
    const { container } = zeige({ members: [] })
    expect(karte(container).querySelector('.einst-namen')?.textContent).toBe(t.werPlantNiemand)
  })

  it('vergeben wird das Recht bei der Person — die Zeile führt hin', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(zeile(karte(container) as HTMLElement, t.beiDerPersonAendern)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'personen' })
  })
})

describe('Die Unteransichten am Handy', () => {
  it.each([
    [t.programmsprachen, t.programmsprachen],
    [t.hilfsdienste, t.hilfsdienste],
    [t.gruppenTitel, t.gruppenTitel],
    [t.erinnerungenCard, t.erinnerungenCard],
  ])('„%s" öffnet sich mit Titel, und Zurück führt zur Übersicht', (name, kopf) => {
    const { container } = zeige()
    fireEvent.click(zeile(container, name)!)
    expect(container.querySelector('.unteransicht-kopf .seitentitel')?.textContent).toBe(kopf)
    fireEvent.click(container.querySelector(`.unteransicht-kopf [aria-label="${t.a11yZurueck}"]`)!)
    expect(container.querySelector('.unteransicht-kopf')).toBeNull()
    expect(titel(container)[0]).toBe(t.versammlungCard)
  })
})

describe('Programmsprachen', () => {
  const oeffne = (over: Partial<AppState> = {}) => {
    const z = zeige(over)
    fireEvent.click(zeile(z.container, t.programmsprachen)!)
    return z
  }

  it('die Sprache der Versammlung führt ins Sprachen-Blatt', () => {
    const { container, dispatch } = oeffne()
    expect(wert(container, t.versSprache)).toBe('Deutsch')
    fireEvent.click(zeile(container, t.versSprache)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openLangSheet' })
  })

  it('eine weitere Sprache geht erst mit dem zweiten Tipp — herausgenommen, nicht gelöscht', () => {
    const { container, dispatch } = oeffne({ progLangs: ['en', 'es'] })
    const zeilen = [...container.querySelectorAll('.einst-zeile--entfernbar')]
    expect(zeilen.map((z) => z.querySelector('.einst-zeile-name')?.textContent)).toEqual(['Englisch', 'Spanisch'])
    const x = () => zeilen[0]!.querySelector('button')!
    fireEvent.click(x())
    expect(dispatch).not.toHaveBeenCalled()
    expect(x().textContent).toBe(t.entfernenSicher)
    fireEvent.click(x())
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeProgLang', code: 'en' })
  })

  it('„Sprache hinzufügen" öffnet dasselbe Blatt im anderen Modus — sonst überschriebe es die Hauptsprache', () => {
    const { container, dispatch } = oeffne()
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === t.spracheHinzu)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openLangSheet', mode: 'alt' })
  })
})

describe('Programm-Import', () => {
  it('sagt, bis wann Programme da sind, und holt die nächste Woche', () => {
    const { container } = zeige({ weeks: [] })
    const karte = [...container.querySelectorAll('.einst-karte')].at(-1)!
    expect(karte.querySelector('.einst-stand')?.textContent).toBe(t.geladenNichts)
    expect(karte.querySelector('.einst-import')?.textContent).toBe(t.importBtn)
  })
})

describe('Am Desktop (`GDesktopEinstellungen`)', () => {
  beforeEach(() => breite(true))
  const eintraege = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('.einst-nav-eintrag')]
  const eintrag = (c: HTMLElement, name: string) =>
    eintraege(c).find((e) => e.querySelector('.einst-nav-name')?.textContent === name)!

  it('links die Abschnitte, jeder mit dem, was gilt', () => {
    const { container } = zeige()
    expect(eintraege(container).map((e) => e.querySelector('.einst-nav-name')?.textContent)).toEqual([
      t.versammlungCard, t.navZusammenkuenfte, t.hilfsdienste, t.gruppenTitel, t.mitteilungenUndErinnerungen,
      t.werPlant, t.importCard,
    ])
    const kurz = (name: string) => eintrag(container, name).querySelector('.klein-text')?.textContent
    expect(kurz(t.versammlungCard)).toBe('Nordheim · Deutsch, Englisch')
    expect(kurz(t.navZusammenkuenfte)).toBe('Dienstag 19:00 · Sonntag 10:00')
    expect(kurz(t.gruppenTitel)).toBe('Gruppen: 1')
    expect(kurz(t.mitteilungenUndErinnerungen)).toBe('Erste 7 Tage vorher, letzte am Tag')
    expect(kurz(t.werPlant)).toBe('Personen: 1')
  })

  it('gewählt ist zuerst die Versammlung — rechts mit ihren Sprachen, ohne eigene Zeile dafür', () => {
    const { container } = zeige()
    expect(eintrag(container, t.versammlungCard).getAttribute('aria-current')).toBe('true')
    expect(container.querySelector('.einstellungen > .seitentitel')?.textContent).toBe(t.versammlungCard)
    expect(zeile(container, t.versSprache)).toBeDefined()
    expect(zeile(container, t.programmsprachen)).toBeUndefined()
  })

  it('der Titel steht einmal — als Überschrift des Abschnitts, nicht noch einmal über der Karte', () => {
    const { container } = zeige()
    for (const name of [t.versammlungCard, t.navZusammenkuenfte, t.werPlant, t.importCard]) {
      fireEvent.click(eintrag(container, name))
      expect(titel(container), name).not.toContain(name)
    }
  })

  it('ein Tipp wählt einen anderen Abschnitt', () => {
    const { container } = zeige()
    fireEvent.click(eintrag(container, t.navZusammenkuenfte))
    expect(eintrag(container, t.navZusammenkuenfte).getAttribute('aria-current')).toBe('true')
    expect(eintrag(container, t.versammlungCard).getAttribute('aria-current')).toBeNull()
    expect(wert(container, t.unterDerWoche)).toBe('Dienstag 19:00')
    // Die Hilfsdienste sind am Desktop ein eigener Abschnitt — keine Zeile hier.
    expect(zeile(container, t.hilfsdienste)).toBeUndefined()
  })

  it('„Mitteilungen und Erinnerungen" zeigt die Zeitleiste der Erinnerungen', () => {
    const { container } = zeige()
    fireEvent.click(eintrag(container, t.mitteilungenUndErinnerungen))
    expect(container.querySelector('.erin-zeitleiste')).not.toBeNull()
  })

  it('die Gruppen stehen am Desktop als Tabelle (`GDesktopEinstellungen`)', () => {
    const { container } = zeige()
    fireEvent.click(eintrag(container, t.gruppenTitel))
    expect(container.querySelector('.gruppen-kopf')).not.toBeNull()
    expect(container.querySelectorAll('.gruppen-zeile')).toHaveLength(1)
  })
})
