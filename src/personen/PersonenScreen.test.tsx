/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import type { Dispatch } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { Absence, AnmeldeLink, Group, Member, Person, Qualifications, Service } from '../data/types'
import type { Ausgestellt, AusgestellterLink } from '../lib/links-ausstellen'
import { privSetzen } from '../data/helpers'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Die Personenliste — der Arbeitsplatz des Koordinators** (T121, Entwurf
 * `GPersonen`).
 *
 * `person-filter.ts` und `person-lage.ts` prüfen ihre Regeln für sich; hier
 * geht es um das, was der Bildschirm selbst zusagt:
 *
 * - Der **Stand der Anmeldung**: oben gezählt und zum Antippen, an jeder
 *   Person als Punkt — und wer noch nicht angemeldet ist, sagt es statt der
 *   Rolle.
 * - **Person anlegen** als Blatt: Angelegt wird erst mit „Hinzufügen".
 * - Zwei **Hinweise**, die stille Fehler sichtbar machen: doppelt vergebene
 *   feste Rollen (die Auto-Zuteilung greift sich irgendeine, F7) und Personen
 *   ohne Predigtdienstgruppe (sie sehen keine Gruppentreffpunkte).
 * - **Links senden** in der Auswahl „Ohne Link": Links für alle, die noch
 *   keinen gültigen haben — und **nur** für die.
 * - Der **Zähler** nennt die *sichtbaren* Personen, nicht alle.
 */

const linksAusstellen = vi.fn((_ids: readonly string[], _wie: { senden: boolean; lang: string }) =>
  Promise.resolve<Ausgestellt>({ links: [], mailBereit: true, fehler: false }),
)

// Nur der Aufruf der Function ist nachgestellt — was der Zustand daraus macht, ist echt.
vi.mock('../lib/links-ausstellen', async (echt) => ({
  ...(await echt<typeof import('../lib/links-ausstellen')>()),
  linksAusstellen: (ids: readonly string[], wie: { senden: boolean; lang: string }) => linksAusstellen(ids, wie),
}))
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

const { PersonenScreen } = await import('./PersonenScreen')

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) privSetzen(q, k, true)
  return q
}

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(),
  grp: null, ...over,
})

const ALT = person('p-a', 'Anton', 'Alt', { mail: 'anton@example.org' })
const BRAND = person('p-b', 'Bernd', 'Brand', { role: 'aeltester', grp: 'g1' })
const COHN = person('p-c', 'Clara', 'Cohn', { female: true, priv: priv('schulung') })
const PERSONEN = [BRAND, COHN, ALT] // absichtlich unsortiert

const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const konto = (personId: string | null, over: Partial<Member> = {}): Member => ({
  userId: `u-${personId}`, personId, email: '', planner: false, zuteiler: false, ...over,
})
/** Ein Link, der noch `tage` Tage gilt (negativ: abgelaufen) — gerechnet von heute, wie die Liste. */
const link = (personId: string, tage = 10): AnmeldeLink => ({
  personId,
  gueltigBis: new Date(Date.now() + tage * 86_400_000).toISOString(),
  erstelltAt: new Date().toISOString(),
  gesendetAt: null,
  benutztAt: null,
})
/** Was die Function für eine Person zurückgibt. */
const ausgestellt = (personId: string, gesendet = false): AusgestellterLink => ({
  personId,
  url: `https://versammlung.app/#anmelden=${'T'.repeat(43)}`,
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
  gesendet,
})
// Bernd hat ein Konto, Clara einen gültigen Link, Anton nichts.
const BRAND_KONTO: Member[] = [konto('p-b')]
const COHN_LINK: AnmeldeLink[] = [link('p-c')]

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    screen: 'personen',
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN, groups: GRUPPEN, services: DIENSTE,
    members: [], anmeldeLinks: [], weeks: [], fsWeeks: [], absences: [],
    selectedPersonId: null,
    ...over,
  }
}

/** Der Bildschirm mit einem Zustand von außen — `rerender` behält dabei seinen eigenen. */
function Buehne({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <PersonenScreen />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  return { dispatch, ...render(<Buehne state={zustand(over)} dispatch={dispatch} />) }
}

/** Am Desktop (ab 1180 px) oder am Handy — jsdom kennt `matchMedia` nicht. */
const breite = (desktop: boolean) => {
  window.matchMedia = vi.fn((q: string) => ({
    matches: desktop || !q.includes('1180'),
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.personen-zeile')]
const namen = (c: HTMLElement) => zeilen(c).map((r) => r.querySelector('.personen-name')?.textContent ?? '')
const unter = (c: HTMLElement, i: number) => zeilen(c)[i]!.querySelector('.klein-text')?.textContent ?? ''
const knopf = (wo: HTMLElement, text: string) =>
  [...wo.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
const suche = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.personen-suche input')!
const zaehler = (c: HTMLElement) => c.querySelector('.personen-zahl')?.textContent
/** Ein Knopf der Auswahl, erkannt am Wort vor seiner Zahl. */
const auswahl = (c: HTMLElement, wort: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('.personen-auswahl')].find((b) => b.firstChild?.textContent === wort)!
/** Ein Stand in der Karte oben, erkannt an seinem Wort. */
const stand = (c: HTMLElement, wort: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('.personen-stand-knopf')].find(
    (b) => b.querySelector('.klein-text')?.textContent === wort,
  )!
/** Das Blatt „Filter" öffnen — es liegt am Dokument, nicht im Bildschirm. */
const filterBlatt = (c: HTMLElement) => {
  fireEvent.click(auswahl(c, t.filterWeitere))
  return document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.filterWeitere}"]`)!
}
const feld = (wo: HTMLElement, marke: string) =>
  [...wo.querySelectorAll<HTMLSelectElement>('select')].find((s) => s.previousElementSibling?.textContent === marke)!
/** Einer der Hinweise oben in der Liste, erkannt an seinem Titel — es gibt mehrere. */
const hinweis = (c: HTMLElement, titel: string) =>
  [...c.querySelectorAll('.personen-hinweis')].find((x) => x.querySelector('.personen-hinweis-titel')?.textContent === titel)

beforeEach(() => {
  breite(false)
  linksAusstellen.mockClear().mockResolvedValue({ links: [], mailBereit: true, fehler: false })
})
afterEach(() => {
  cleanup()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('Die Liste', () => {
  it('steht alphabetisch nach Nachname — und zeigt „Nachname, Vorname"', () => {
    const { container } = zeige()
    expect(namen(container)).toEqual(['Alt, Anton', 'Brand, Bernd', 'Cohn, Clara'])
  })

  it('jede Zeile nennt Gruppe und Rolle', () => {
    // Mit Konto, damit der Stand hier nicht mitspricht — er hat seine eigenen Fälle.
    const { container } = zeige({ members: PERSONEN.map((p) => konto(p.id)) })
    expect(unter(container, 1)).toBe('Gruppe 1 · Ältester')
    expect(unter(container, 2), 'ohne Gruppe nur die Rolle').toBe('Verkündiger')
  })

  it('rechts das Recht: „Admin" vor „Planer" — mit Konto zählt das Konto', () => {
    const { container } = zeige({
      members: [konto('p-a', { planner: true }), konto('p-b', { zuteiler: true }), konto('p-c')],
    })
    expect(zeilen(container).map((z) => z.querySelector('.personen-marke')?.textContent ?? '')).toEqual([
      t.planerLbl,
      t.rollePlaner,
      '',
    ])
  })

  it('ein Tipp öffnet diese Person', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(zeilen(container)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: 'p-a' })
  })
})

/**
 * **Wer kein App-Konto hat, erfährt nichts von selbst** (V13/F10).
 *
 * Weder „Plan senden" noch die Erinnerung erreichen ihn. Deshalb steht der
 * Stand an jeder Person, während der Planer plant — als Punkt in derselben
 * Sprache wie überall und, bei allen ohne Konto, statt der Rolle als Wort.
 */
describe('Stand der Anmeldung', () => {
  const MIT_STAENDEN: Partial<AppState> = { members: BRAND_KONTO, anmeldeLinks: COHN_LINK }

  it('jede Person trägt ihren Punkt: voll angemeldet, blass mit Link, gestrichelt ohne', () => {
    const { container } = zeige(MIT_STAENDEN)
    // Reihenfolge: Alt (nichts), Brand (Konto), Cohn (Link).
    expect(zeilen(container).map((z) => z.querySelector('.punkt')?.className)).toEqual([
      'punkt is-offen',
      'punkt is-voll',
      'punkt is-wartet',
    ])
  })

  it('wer noch nicht angemeldet ist, steht statt mit der Rolle mit seinem Stand da', () => {
    const { container } = zeige(MIT_STAENDEN)
    expect(unter(container, 0)).toBe(t.standOhneLink)
    expect(unter(container, 1)).toBe('Gruppe 1 · Ältester')
    // Ein Link macht niemanden erreichbar — wer einen hat, ist noch nicht angemeldet.
    expect(unter(container, 2)).toBe(t.standLink)
  })

  it('oben gezählt — ein Tipp grenzt ein, ein zweiter hebt es wieder auf', () => {
    const { container } = zeige(MIT_STAENDEN)
    expect([...container.querySelectorAll('.personen-stand-zahl')].map((z) => z.textContent)).toEqual(['1', '1', '1'])
    fireEvent.click(stand(container, t.standLink))
    expect(namen(container)).toEqual(['Cohn, Clara'])
    expect(stand(container, t.standLink).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(stand(container, t.standLink))
    expect(namen(container)).toHaveLength(3)
  })

  it('„Noch nicht angemeldet" zeigt, wer einen Link hat, und wer keinen hat', () => {
    const { container } = zeige(MIT_STAENDEN)
    fireEvent.click(auswahl(container, t.zusagenOhneKonto))
    expect(namen(container)).toEqual(['Alt, Anton', 'Cohn, Clara'])
    expect(auswahl(container, t.zusagenOhneKonto).textContent).toBe(`${t.zusagenOhneKonto}2`)
  })

  it('die Zahlen zählen unter der Suche — was sie ausschließt, zählt nicht mit', () => {
    const { container } = zeige(MIT_STAENDEN)
    fireEvent.change(suche(container), { target: { value: 'cohn' } })
    expect([...container.querySelectorAll('.personen-stand-zahl')].map((z) => z.textContent)).toEqual(['0', '1', '0'])
    expect(auswahl(container, t.filterAlle).textContent).toBe(`${t.filterAlle}1`)
  })

  it('ohne angemeldetes Konto (Entwicklerseite) weder Punkte noch Stand — nur die Rolle', () => {
    const { container } = zeige({ ...MIT_STAENDEN, userId: null, congregationId: null })
    expect(container.querySelector('.personen-zeile .punkt')).toBeNull()
    expect(container.querySelector('.personen-stand')).toBeNull()
    expect(unter(container, 0)).toBe('Verkündiger')
    expect([...container.querySelectorAll('.personen-auswahl')].map((b) => b.firstChild?.textContent)).toEqual([
      t.filterAlle,
      t.abwesendChip,
      t.filterWeitere,
    ])
  })
})

describe('Heute abwesend', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9))
  })
  afterEach(() => vi.useRealTimers())

  const abw = (personId: string, from: string, to: string): Absence => ({
    id: `a-${personId}`, personId, userId: null, from, to, reason: '',
  })

  it('wer heute fehlt, sagt in seiner Zeile, wie lange — in der Farbe der Probleme', () => {
    const { container } = zeige({ absences: [abw('p-b', '2026-09-07', '2026-09-11')] })
    const zeile = zeilen(container)[1]!.querySelector('.klein-text')!
    expect(zeile.textContent).toBe(zahlBinden('abwesend 7.–11. September'))
    expect(zeile.className).toContain('is-problem')
  })

  it('„Abwesend" zeigt nur, wer heute fehlt — nicht wer bald oder schon wieder da ist', () => {
    const { container } = zeige({
      absences: [abw('p-b', '2026-09-07', '2026-09-11'), abw('p-c', '2026-09-08', '2026-09-20')],
    })
    fireEvent.click(auswahl(container, t.abwesendChip))
    expect(namen(container)).toEqual(['Brand, Bernd'])
  })
})

describe('Person anlegen', () => {
  const blatt = () => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.personAnlegen}"]`)
  const oeffnen = (c: HTMLElement) => {
    fireEvent.click(c.querySelector(`[aria-label="${t.personAnlegen}"]`)!)
    return blatt()!
  }
  const eingabe = (b: HTMLElement, marke: string) =>
    [...b.querySelectorAll<HTMLInputElement>('input')].find((i) => i.previousElementSibling?.textContent === marke)!

  it('der Knopf öffnet ein Blatt — angelegt wird erst mit „Hinzufügen", mit allem, was es gefragt hat', () => {
    const { container, dispatch } = zeige()
    const b = oeffnen(container)
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.change(eingabe(b, t.vorname), { target: { value: ' Dora ' } })
    fireEvent.change(eingabe(b, t.nachname), { target: { value: 'Dahl' } })
    fireEvent.change(eingabe(b, t.emailFreiwillig), { target: { value: 'dora@example.org' } })
    fireEvent.click(knopf(b, t.schwester))
    fireEvent.change(feld(b, t.gruppeLbl), { target: { value: 'g1' } })
    fireEvent.change(feld(b, t.rolle), { target: { value: 'keine' } })
    fireEvent.click(knopf(b, t.hinzufuegenKnopf))
    const aktion = dispatch.mock.calls.find((c) => c[0].type === 'addPerson')![0]
    expect(aktion.person).toMatchObject({
      fn: 'Dora', ln: 'Dahl', mail: 'dora@example.org', female: true, grp: 'g1', role: 'keine', tel: '',
    })
    expect(aktion.person.priv).toEqual(emptyQualifications())
    expect(aktion.person.id).toBeTruthy()
    expect(blatt(), 'das Blatt geht zu — der Reducer öffnet die neue Person').toBeNull()
  })

  it('Enter im Feld legt ebenso an', () => {
    const { container, dispatch } = zeige()
    const b = oeffnen(container)
    fireEvent.change(eingabe(b, t.nachname), { target: { value: 'Dahl' } })
    fireEvent.submit(b.querySelector('form')!)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addPerson')).toBe(true)
  })

  it('ohne Namen bleibt „Hinzufügen" gesperrt — und Enter legt nichts an', () => {
    const { container, dispatch } = zeige()
    const b = oeffnen(container)
    fireEvent.change(eingabe(b, t.vorname), { target: { value: '   ' } })
    expect(knopf(b, t.hinzufuegenKnopf).disabled).toBe(true)
    fireEvent.submit(b.querySelector('form')!)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ein Name, den es schon gibt, sperrt — und sagt, wer ihn trägt', () => {
    const { container } = zeige()
    const b = oeffnen(container)
    fireEvent.change(eingabe(b, t.vorname), { target: { value: 'anton' } })
    fireEvent.change(eingabe(b, t.nachname), { target: { value: 'ALT' } })
    expect(b.querySelector('[role="alert"]')?.textContent).toContain('Anton Alt')
    expect(eingabe(b, t.vorname).getAttribute('aria-invalid')).toBe('true')
    expect(knopf(b, t.hinzufuegenKnopf).disabled).toBe(true)
  })

  it('„Abbrechen" legt nichts an', () => {
    const { container, dispatch } = zeige()
    const b = oeffnen(container)
    fireEvent.change(eingabe(b, t.nachname), { target: { value: 'Dahl' } })
    fireEvent.click(knopf(b, t.abbrechen))
    expect(blatt()).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ohne angelegte Gruppen fragt es nach keiner', () => {
    const { container } = zeige({ groups: [] })
    expect(feld(oeffnen(container), t.gruppeLbl)).toBeUndefined()
  })
})

describe('Der Zähler nennt die sichtbaren, nicht alle', () => {
  it('ohne Einschränkung steht keiner da — „Alle" nennt die Zahl schon', () => {
    const { container } = zeige()
    expect(zaehler(container)).toBeUndefined()
    expect(auswahl(container, t.filterAlle).textContent).toBe(`${t.filterAlle}3`)
  })

  it('mit Suche nur die Treffer — so sieht man, wie stark sie einschränkt', () => {
    const { container } = zeige()
    fireEvent.change(suche(container), { target: { value: 'alt' } })
    expect(namen(container)).toEqual(['Alt, Anton'])
    expect(zaehler(container)).toBe(zahlBinden('Personen: 1'))
  })

  it('die Suche findet auch über die E-Mail-Adresse', () => {
    const { container } = zeige()
    fireEvent.change(suche(container), { target: { value: 'anton@' } })
    expect(namen(container)).toEqual(['Alt, Anton'])
  })

  it('findet nichts, sagt der Zähler 0 — die Liste ist leer, nicht kaputt', () => {
    const { container } = zeige()
    fireEvent.change(suche(container), { target: { value: 'zzz' } })
    expect(zeilen(container)).toHaveLength(0)
    expect(zaehler(container)).toBe(zahlBinden('Personen: 0'))
  })
})

describe('Das Blatt „Filter"', () => {
  it('Geschlecht, Rolle, Gruppe und Aufgabenbereich stehen zur Wahl', () => {
    const b = filterBlatt(zeige().container)
    expect([...b.querySelectorAll('.feld-marke')].map((x) => x.textContent)).toEqual([
      t.geschlecht, t.rolle, t.gruppeLbl, t.aufgabenbereiche,
    ])
  })

  it('ohne angelegte Gruppen entfällt die Gruppen-Auswahl — sie hätte nur den Platzhalter', () => {
    const b = filterBlatt(zeige({ groups: [] }).container)
    expect([...b.querySelectorAll('.feld-marke')].map((x) => x.textContent)).toEqual([
      t.geschlecht, t.rolle, t.aufgabenbereiche,
    ])
  })

  it('eine Wahl grenzt sofort ein, hebt ihr Feld hervor und steht als Zahl am Knopf', () => {
    const { container } = zeige()
    const b = filterBlatt(container)
    fireEvent.change(feld(b, t.geschlecht), { target: { value: 'w' } })
    expect(namen(container)).toEqual(['Cohn, Clara'])
    expect(feld(b, t.geschlecht).className).toContain('is-gesetzt')
    expect(auswahl(container, t.filterWeitere).textContent).toBe(`${t.filterWeitere}1`)
    expect(auswahl(container, t.filterWeitere).getAttribute('aria-pressed')).toBe('true')
  })

  it('mehrere Felder wirken zusammen — nicht nebeneinander', () => {
    const { container } = zeige()
    const b = filterBlatt(container)
    fireEvent.change(feld(b, t.rolle), { target: { value: 'aeltester' } })
    fireEvent.change(feld(b, t.geschlecht), { target: { value: 'w' } })
    expect(zeilen(container)).toHaveLength(0) // ein weiblicher Ältester ist keiner da
  })

  it('„Zurücksetzen" hebt die Felder auf — die Suche bleibt', () => {
    const { container } = zeige()
    fireEvent.change(suche(container), { target: { value: 'c' } })
    const b = filterBlatt(container)
    fireEvent.change(feld(b, t.geschlecht), { target: { value: 'm' } })
    fireEvent.click(knopf(b, t.filterZuruecksetzen))
    expect(feld(b, t.geschlecht).value).toBe('')
    expect(suche(container).value).toBe('c')
    expect(auswahl(container, t.filterWeitere).getAttribute('aria-pressed')).toBe('false')
  })

  it('die Bereichs-Auswahl führt die festen Bereiche UND jeden Hilfsdienst', () => {
    const werte = [...feld(filterBlatt(zeige().container), t.aufgabenbereiche).querySelectorAll('option')].map(
      (o) => o.getAttribute('value'),
    )
    expect(werte).toContain(serviceQualKey('mik'))
    expect(werte).toContain('schulung')
  })

  it('die Bereichs-Auswahl führt auch die festen Rollen — so findet man den festen Leiter', () => {
    // Als Bereich zählen sie nicht (eigene Karte im Detail), gesucht wird nach
    // ihnen aber genauso. Bis zum 4.10.2026 fehlten sie hier: Wer den festen
    // Leiter suchte, öffnete ein Detail nach dem anderen.
    const leiter = person('p-l', 'Lars', 'Leiter', { priv: priv('wtLeiter') })
    const { container } = zeige({ persons: [...PERSONEN, leiter] })
    const wahl = feld(filterBlatt(container), t.aufgabenbereiche)
    const optionen = [...wahl.querySelectorAll('option')]
    expect(optionen.find((o) => o.value === 'wtLeiter')?.textContent).toBe(t.privWtLeiter)
    expect(optionen.find((o) => o.value === 'wtVertreter')?.textContent).toBe(t.privWtVertreter)
    fireEvent.change(wahl, { target: { value: 'wtLeiter' } })
    expect(namen(container)).toEqual(['Leiter, Lars'])
  })

  it('die Gruppen-Rotation hat keinen Bereich und steht deshalb nicht dabei', () => {
    const werte = [...feld(filterBlatt(zeige().container), t.aufgabenbereiche).querySelectorAll('option')].map(
      (o) => o.getAttribute('value'),
    )
    expect(werte).not.toContain(serviceQualKey('rein'))
  })

  it('die Auswahl steht alphabetisch — man sucht das Wort, nicht die Programmreihenfolge', () => {
    const texte = [...feld(filterBlatt(zeige().container), t.aufgabenbereiche).querySelectorAll('option')]
      .slice(1) // der Platzhalter „—" bleibt vorn
      .map((o) => o.textContent ?? '')
    expect(texte).toEqual([...texte].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })))
  })
})

/**
 * **Suche und Filter überstehen das Detail** (5.10.2026).
 *
 * Das Detail ersetzt am Handy die Liste. Bis dahin hielt die Liste ihren
 * Filter selbst und verlor ihn dabei: Wer die Personen einer Gruppe
 * nacheinander bearbeitete, stellte nach jeder Person den Filter neu ein.
 * Gezeigt wird mit `rerender`, damit der Bildschirm derselbe bleibt — so wie in
 * der App, wo nur `selectedPersonId` wechselt.
 */
describe('Suche und Filter überstehen das Detail', () => {
  it('Filter setzen → Person öffnen → zurück: Suche, Auswahl, Filter und Treffer stehen noch', () => {
    const dispatch = vi.fn()
    const liste = zustand({ members: BRAND_KONTO })
    const { container, rerender } = render(<Buehne state={liste} dispatch={dispatch} />)
    fireEvent.change(suche(container), { target: { value: 'c' } })
    fireEvent.click(auswahl(container, t.zusagenOhneKonto))
    fireEvent.change(feld(filterBlatt(container), t.geschlecht), { target: { value: 'w' } })
    fireEvent.click(knopf(document.body, t.fertig))
    expect(namen(container)).toEqual(['Cohn, Clara'])

    // Ein Tipp öffnet die Person — in der App setzt der Reducer die Kennung.
    fireEvent.click(zeilen(container)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: 'p-c' })
    rerender(<Buehne state={{ ...liste, selectedPersonId: 'p-c' }} dispatch={dispatch} />)
    expect(container.querySelector('.personen-liste'), 'jetzt steht die Person da').toBeNull()

    // Zurück: `selectPerson` mit null.
    rerender(<Buehne state={liste} dispatch={dispatch} />)
    expect(suche(container).value).toBe('c')
    expect(auswahl(container, t.zusagenOhneKonto).getAttribute('aria-pressed')).toBe('true')
    expect(auswahl(container, t.filterWeitere).textContent).toBe(`${t.filterWeitere}1`)
    expect(namen(container)).toEqual(['Cohn, Clara'])
    expect(zaehler(container)).toBe(zahlBinden('Personen: 1'))
  })

  it('ein anderer Bildschirm setzt sie zurück — der Bildschirm baut sich dann ab', () => {
    const dispatch = vi.fn()
    const liste = zustand()
    const { container, rerender } = render(<Buehne state={liste} dispatch={dispatch} />)
    fireEvent.change(suche(container), { target: { value: 'cohn' } })
    rerender(<></>)
    rerender(<Buehne state={liste} dispatch={dispatch} />)
    expect(suche(container).value).toBe('')
    expect(namen(container)).toHaveLength(3)
  })
})

describe('Am Desktop (`GDesktopPersonen`)', () => {
  beforeEach(() => breite(true))

  it('steht die gewählte Person rechts neben der Liste, statt sie zu ersetzen — ihre Zeile hervorgehoben', () => {
    const { container } = zeige({ selectedPersonId: 'p-b' })
    expect(namen(container)).toHaveLength(3)
    const spalte = container.querySelector('.personen-spalte')!
    expect(spalte.getAttribute('aria-label')).toBe('Bernd Brand')
    expect(spalte.querySelector('.person-name')?.textContent).toBe('Bernd Brand')
    expect(zeilen(container).map((z) => z.getAttribute('aria-current'))).toEqual([null, 'true', null])
  })

  it('ohne gewählte Person sagt die Spalte, was zu tun ist', () => {
    expect(zeige().container.querySelector('.personen-spalte')?.textContent).toBe(t.personWaehlen)
  })

  it('jede Zeile in Spalten: Name, Gruppe und Rolle, dann Stand und Recht', () => {
    const { container } = zeige({ members: [konto('p-b', { planner: true })], anmeldeLinks: COHN_LINK })
    const zellen = zeilen(container).map((z) => [...z.querySelectorAll('.personen-zelle')].map((s) => s.textContent))
    expect(zellen).toEqual([
      ['Alt, Anton', 'Verkündiger', t.standOhneLink],
      ['Brand, Bernd', 'Gruppe 1 · Ältester', `${t.standAngemeldet} · ${t.planerLbl}`],
      ['Cohn, Clara', 'Verkündiger', t.standLink],
    ])
  })

  it('die drei Stände stehen als Knöpfe in der Reihe — statt der Karte darüber', () => {
    const { container } = zeige({ members: BRAND_KONTO, anmeldeLinks: COHN_LINK })
    expect(container.querySelector('.personen-stand')).toBeNull()
    fireEvent.click(auswahl(container, t.standOhneLink))
    expect(namen(container)).toEqual(['Alt, Anton'])
  })
})

/*
 * Hier stand „Warnung vor doppelten Anzeigenamen". Sie ist mit T110 entfallen
 * — ein doppelter Name lässt sich nicht mehr speichern, also gibt es nichts
 * mehr zu melden. Die Meldung steht jetzt am Feld (Detail und „Person
 * anlegen"), die Regel dahinter in `helpers.test.ts > namensDublette`, und die
 * Zusicherung im Index `persons_name_eindeutig` (`schema.test.ts`).
 */

/**
 * **Feste Rollen sind je eine Person** (F7).
 *
 * Trägt eine Rolle mehr als einer, greift sich die Auto-Zuteilung irgendeinen.
 * Seit dem 4.10.2026 nennt der Hinweis die Betroffenen mit Namen, als Knöpfe
 * wie bei „Ohne Predigtdienstgruppe".
 */
describe('Hinweis auf doppelt vergebene feste Rollen (F7)', () => {
  const NORD = person('p-1', 'Otto', 'Nord', { priv: priv('wtLeiter') })
  const MEIER = person('p-2', 'Hans', 'Meier', { priv: priv('wtLeiter') })
  const ALT = person('p-3', 'Anton', 'Alt', { priv: priv('wtVertreter') })
  const BRAND = person('p-4', 'Bernd', 'Brand', { priv: priv('wtVertreter') })
  // Über die Kennung statt über den Titel: Ein Fall unten läuft schwedisch.
  const rollen = (c: HTMLElement) => c.querySelector('[data-warnung="feste-rollen"]')
  /** Die Namen unter einer Rolle, in ihrer Folge. */
  const chips = (c: HTMLElement, rolle: string) => [
    ...(rollen(c)?.querySelectorAll<HTMLButtonElement>(`[data-rolle="${rolle}"] .personen-name-knopf`) ?? []),
  ]
  const texte = (knoepfe: HTMLButtonElement[]) => knoepfe.map((b) => b.textContent)

  it('zwei Wachtturm-Leiter werden gemeldet — die Auto-Zuteilung nähme sonst irgendeinen', () => {
    const { container } = zeige({ persons: [NORD, MEIER] })
    expect(hinweis(container, t.wtRollenLabel)).toBe(rollen(container))
    expect(rollen(container)?.querySelector('.personen-hinweis-text')?.textContent).toBe(t.wtRollenDoppeltHint)
    expect(rollen(container)?.querySelector('.personen-hinweis-zeile')?.textContent).toBe(
      zahlBinden('„Wachtturm-Studium-Leiter“ · 2 Personen'),
    )
  })

  it('nennt unter der Rolle, wer sie trägt — in der Folge der Liste', () => {
    // Absichtlich unsortiert übergeben: Nord vor Meier.
    const { container } = zeige({ persons: [NORD, MEIER] })
    expect(texte(chips(container, 'wtLeiter'))).toEqual(['Meier, Hans', 'Nord, Otto'])
  })

  it('ein Tipp auf den Namen öffnet die Person, bei der der Schalter steht', () => {
    const { container, dispatch } = zeige({ persons: [NORD, MEIER] })
    fireEvent.click(chips(container, 'wtLeiter')[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: 'p-1' })
  })

  it('Leiter und Vertreter stehen getrennt, jede Rolle mit ihren Personen', () => {
    const { container } = zeige({ persons: [NORD, BRAND, MEIER, ALT] })
    expect(rollen(container)?.querySelector('.personen-hinweis-zahl')?.textContent).toBe('2')
    expect(texte(chips(container, 'wtLeiter'))).toEqual(['Meier, Hans', 'Nord, Otto'])
    expect(texte(chips(container, 'wtVertreter'))).toEqual(['Alt, Anton', 'Brand, Bernd'])
  })

  it('ein einzelner Vertreter steht nicht darin — nur die doppelt vergebene Rolle', () => {
    const { container } = zeige({ persons: [NORD, MEIER, ALT] })
    expect(rollen(container)?.querySelector('.personen-hinweis-zahl')?.textContent).toBe('1')
    expect(chips(container, 'wtVertreter')).toEqual([])
  })

  it('sortiert in der Sprache des Lesers — türkisch steht Ö hinter O', () => {
    // Deutsch gilt Ö als O, „Ötken" steht also vor „Ozan": Die Gegenprobe
    // zeigt, dass die Folge wirklich an der Sprache hängt und nicht zufällig
    // stimmt. (Bis zum 15.10.2026 schwedisch gemessen, Å hinter Z.)
    const oetken = person('p-5', 'Ali', 'Ötken', { priv: priv('wtLeiter') })
    const ozan = person('p-6', 'Can', 'Ozan', { priv: priv('wtLeiter') })
    const tuerkisch = zeige({ persons: [oetken, ozan], lang: 'tr' }).container
    expect(texte(chips(tuerkisch, 'wtLeiter'))).toEqual(['Ozan, Can', 'Ötken, Ali'])
    cleanup()
    const deutsch = zeige({ persons: [oetken, ozan] }).container
    expect(texte(chips(deutsch, 'wtLeiter'))).toEqual(['Ötken, Ali', 'Ozan, Can'])
  })

  it('die Suche engt die Liste ein, den Hinweis nicht — er gilt der ganzen Versammlung', () => {
    const { container } = zeige({ persons: [NORD, MEIER] })
    fireEvent.change(suche(container), { target: { value: 'nord' } })
    expect(namen(container)).toEqual(['Nord, Otto'])
    expect(texte(chips(container, 'wtLeiter'))).toEqual(['Meier, Hans', 'Nord, Otto'])
  })

  it('einer ist kein Problem', () => {
    expect(rollen(zeige({ persons: [NORD] }).container)).toBeNull()
  })
})

/**
 * **Wer keiner Predigtdienstgruppe zugeordnet ist, steht oben in der Liste**
 * (gemeldet am 13.9.2026).
 *
 * Ohne Gruppe zeigt das Programm keine Gruppentreffpunkte (`fsVisible`), und
 * bis dahin stand das nirgends — auch nicht, nachdem eine gelöschte Gruppe
 * alle ihre Mitglieder so zurückgelassen hatte. Die Namen sind Knöpfe: Der Weg
 * zum Beheben ist ein Tipp.
 *
 * Vorgabe der Liste: Brand ist in g1, Alt und Cohn sind es nicht.
 */
describe('Hinweis: ohne Predigtdienstgruppe', () => {
  const ohne = (c: HTMLElement) => hinweis(c, t.ohneGruppeTitle)
  const chips = (c: HTMLElement) => [...(ohne(c)?.querySelectorAll<HTMLButtonElement>('.personen-name-knopf') ?? [])]

  it('nennt jeden ohne Gruppe mit Namen — in der Reihenfolge der Liste, mit Zahl und Grund', () => {
    const { container } = zeige()
    expect(chips(container).map((b) => b.textContent)).toEqual(['Alt, Anton', 'Cohn, Clara'])
    expect(ohne(container)?.querySelector('.personen-hinweis-zahl')?.textContent).toBe('2')
    expect(ohne(container)?.querySelector('.personen-hinweis-text')?.textContent).toBe(t.ohneGruppeHint)
  })

  it('ein Tipp auf den Namen öffnet die Person, bei der die Gruppe gesetzt wird', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(chips(container)[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: 'p-c' })
  })

  it('die Rolle „Keine" braucht keine Gruppe und steht nicht darin', () => {
    const schueler = person('p-k', 'Kai', 'Kurz', { role: 'keine' })
    const { container } = zeige({ persons: [...PERSONEN, schueler] })
    expect(chips(container).map((b) => b.textContent)).not.toContain('Kurz, Kai')
    expect(chips(container)).toHaveLength(2)
  })

  it('wer auf eine gelöschte Gruppe verweist, steht ebenso darin', () => {
    const verwaist = person('p-v', 'Vera', 'Voss', { grp: 'g-geloescht' })
    const { container } = zeige({ persons: [BRAND, verwaist] })
    expect(chips(container).map((b) => b.textContent)).toEqual(['Voss, Vera'])
  })

  it('die Suche engt die Liste ein, den Hinweis nicht — er gilt der ganzen Versammlung', () => {
    const { container } = zeige()
    fireEvent.change(suche(container), { target: { value: 'brand' } })
    expect(namen(container)).toEqual(['Brand, Bernd'])
    expect(chips(container)).toHaveLength(2)
  })

  it('ohne angelegte Gruppen gibt es nichts zu melden', () => {
    expect(ohne(zeige({ groups: [] }).container)).toBeUndefined()
  })

  it('sind alle zugeordnet, steht der Hinweis nicht da', () => {
    const alle = PERSONEN.map((p) => ({ ...p, grp: 'g1' }))
    expect(ohne(zeige({ persons: alle }).container)).toBeUndefined()
  })
})

/**
 * **Links senden** (T121, Phase 8; Entwurf `GAlleEinladen`): allen, die die
 * Liste in der Auswahl „Ohne Link" zeigt, auf einmal ihren Zugang — wer eine
 * Adresse hat, per E-Mail, die übrigen auf einem Zettel. Wer schon einen
 * gültigen Link hat, bekommt keinen neuen: Er ersetzte den alten samt Zettel.
 */
describe('Links senden', () => {
  const MIT_STAENDEN: Partial<AppState> = { members: BRAND_KONTO, anmeldeLinks: COHN_LINK }
  const DAHL = person('p-d', 'Dora', 'Dahl', { mail: 'dora@example.org' })
  const ERNST = person('p-e', 'Emil', 'Ernst')
  const dialog = () => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.linksSenden}"]`)
  /** In die Auswahl „Ohne Link" und das Blatt öffnen. */
  const blatt = (c: HTMLElement) => {
    fireEvent.click(stand(c, t.standOhneLink))
    fireEvent.click(knopf(c, t.linksSenden))
    return dialog()!
  }
  const toasts = (dispatch: ReturnType<typeof vi.fn>) =>
    dispatch.mock.calls.map((c) => c[0] as AppAction).flatMap((a) => (a.type === 'showToast' ? [a.text] : []))

  it('steht nur in der Auswahl „Ohne Link" — „alle" sind dort genau die', () => {
    const { container } = zeige(MIT_STAENDEN)
    expect(knopf(container, t.linksSenden)).toBeUndefined()
    fireEvent.click(stand(container, t.standOhneLink))
    expect(knopf(container, t.linksSenden)).toBeDefined()
  })

  it('ohne angemeldetes Konto gibt es ihn gar nicht — niemand, der Links ausgibt (Entwicklerseite)', () => {
    const { container } = zeige({ userId: null, congregationId: null })
    expect(container.querySelector('.personen-stand')).toBeNull()
    expect(knopf(container, t.linksSenden)).toBeUndefined()
  })

  it('hat jeder ein Konto oder einen gültigen Link, steht er nicht da — die Auswahl ist leer', () => {
    const { container } = zeige({ members: [konto('p-a'), konto('p-b')], anmeldeLinks: COHN_LINK })
    fireEvent.click(stand(container, t.standOhneLink))
    expect(zeilen(container)).toHaveLength(0)
    expect(knopf(container, t.linksSenden)).toBeUndefined()
  })

  it('ein abgelaufener Link zählt wie keiner — wer so steht, ist dabei', () => {
    const { container } = zeige({ members: BRAND_KONTO, anmeldeLinks: [link('p-c', -1)] })
    fireEvent.click(stand(container, t.standOhneLink))
    expect(namen(container)).toEqual(['Alt, Anton', 'Cohn, Clara'])
  })

  it('teilt in „Per E-Mail" und „Ohne E-Mail-Adresse", jeweils mit Zahl', () => {
    const b = blatt(zeige({ ...MIT_STAENDEN, persons: [...PERSONEN, DAHL, ERNST] }).container)
    const titel = [...b.querySelectorAll('.link-weg-titel')].map((x) => x.textContent)
    expect(titel).toEqual([`${t.perEmail} · 2`, `${t.ohneEmail} · 1`])
  })

  it('„Links senden" schickt die mit Adresse — mit Versand, in der Sprache der Versammlung', async () => {
    const b = blatt(zeige({ ...MIT_STAENDEN, persons: [...PERSONEN, DAHL, ERNST] }).container)
    fireEvent.click(knopf(b, t.linksSenden))
    await waitFor(() => expect(linksAusstellen).toHaveBeenCalledWith(['p-a', 'p-d'], { senden: true, lang: 'de' }))
  })

  it('genau die, die die Liste zeigt — die Suche grenzt mit ein', async () => {
    const { container } = zeige({ ...MIT_STAENDEN, persons: [...PERSONEN, DAHL] })
    fireEvent.click(stand(container, t.standOhneLink))
    fireEvent.change(suche(container), { target: { value: 'dahl' } })
    fireEvent.click(knopf(container, t.linksSenden))
    fireEvent.click(knopf(dialog()!, t.linksSenden))
    // Anton hat ebenso keinen Link, steht aber nicht in der Liste.
    await waitFor(() => expect(linksAusstellen).toHaveBeenCalledWith(['p-d'], { senden: true, lang: 'de' }))
  })

  it('die ausgestellten Links kommen in den Zustand — der Stand stimmt gleich', async () => {
    linksAusstellen.mockResolvedValue({ links: [ausgestellt('p-a', true)], mailBereit: true, fehler: false })
    const { container, dispatch } = zeige(MIT_STAENDEN)
    fireEvent.click(knopf(blatt(container), t.linksSenden))
    await waitFor(() => expect(dispatch.mock.calls.some((c) => c[0].type === 'linksAusgestellt')).toBe(true))
    const aktion = dispatch.mock.calls.find((c) => c[0].type === 'linksAusgestellt')![0]
    expect(aktion.links).toEqual([expect.objectContaining({ personId: 'p-a', gueltigBis: '2026-11-14T09:00:00.000Z', benutztAt: null })])
    expect(aktion.links[0].gesendetAt).not.toBeNull()
  })

  it('sind alle angekommen, sagt es das und schließt', async () => {
    linksAusstellen.mockResolvedValue({ links: [ausgestellt('p-a', true)], mailBereit: true, fehler: false })
    const { container, dispatch } = zeige(MIT_STAENDEN)
    fireEvent.click(knopf(blatt(container), t.linksSenden))
    await waitFor(() => expect(toasts(dispatch)).toContain(fill(t.toastLinksGesendet, { n: 1 })))
    await waitFor(() => expect(dialog()).toBeNull())
  })

  it('kam eine nicht an, sagt es wie viele — und bleibt offen, für die Zettel', async () => {
    linksAusstellen.mockResolvedValue({ links: [ausgestellt('p-a', true), ausgestellt('p-d', false)], mailBereit: true, fehler: false })
    const { container, dispatch } = zeige({ ...MIT_STAENDEN, persons: [...PERSONEN, DAHL] })
    fireEvent.click(knopf(blatt(container), t.linksSenden))
    await waitFor(() => expect(toasts(dispatch)).toContain(fill(t.toastLinksTeils, { n: 1, m: 1 })))
    expect(dialog()).not.toBeNull()
  })

  it('kann die App nicht senden, sagt sie es — und kein Link wurde ersetzt', async () => {
    linksAusstellen.mockResolvedValue({ links: [], mailBereit: false, fehler: false })
    const { container, dispatch } = zeige(MIT_STAENDEN)
    fireEvent.click(knopf(blatt(container), t.linksSenden))
    await waitFor(() => expect(toasts(dispatch)).toContain(t.mailNichtBereit))
    expect(dispatch.mock.calls.some((c) => c[0].type === 'linksAusgestellt')).toBe(false)
  })

  it('zwei an derselben Adresse: Jeder bekommt seinen eigenen Link, und das Blatt sagt es', () => {
    const lena = person('p-l', 'Lena', 'Hoffmann', { mail: 'familie@example.org' })
    const andrea = person('p-n', 'Andrea', 'Hoffmann', { mail: ' Familie@example.org' })
    const b = blatt(zeige({ persons: [lena, andrea, ALT] }).container)
    expect(b.querySelector('.link-geteilt')?.textContent).toBe(
      t.eineAdresseMehrere + fill(t.eineAdresseMehrereHint, { namen: 'Andrea Hoffmann und Lena Hoffmann' }),
    )
  })

  it('„Zettel drucken" stellt für die ohne Adresse Links aus, ohne Versand — und druckt sie', async () => {
    const drucken = vi.fn()
    window.print = drucken
    linksAusstellen.mockResolvedValue({ links: [ausgestellt('p-e')], mailBereit: true, fehler: false })
    const b = blatt(zeige({ ...MIT_STAENDEN, persons: [...PERSONEN, ERNST] }).container)
    fireEvent.click(knopf(b, t.zettelDrucken))
    await waitFor(() => expect(drucken).toHaveBeenCalled())
    expect(linksAusstellen).toHaveBeenCalledWith(['p-e'], { senden: false, lang: 'de' })
    expect([...document.querySelectorAll('.anmelde-zettel .anmelde-name')].map((n) => n.textContent)).toEqual(['Emil Ernst'])
    expect(document.documentElement.dataset.print).toBe('anmeldezettel')
    // Nach dem Druckdialog ist der Bogen wieder fort — die Codes darauf melden an.
    fireEvent(window, new Event('afterprint'))
    await waitFor(() => expect(document.querySelector('.anmelde-bogen')).toBeNull())
    expect(document.documentElement.dataset.print).toBeUndefined()
  })

  it('im Offline-Stand stellt es nichts aus und verschickt nichts', async () => {
    const { container, dispatch } = zeige({ ...MIT_STAENDEN, staleAt: Date.now() - 3600_000 })
    fireEvent.click(knopf(blatt(container), t.linksSenden))
    await waitFor(() => expect(toasts(dispatch)).toContain(t.offlineReadOnly))
    expect(linksAusstellen).not.toHaveBeenCalled()
  })
})

describe('Konten ohne verknüpfte Person', () => {
  const WAISE: Member[] = [{ userId: 'u9', personId: null, email: 'wer@example.org', planner: false, zuteiler: false }]

  it('stehen ganz oben — sonst übersieht man sie', () => {
    const { container } = zeige({ members: WAISE })
    const panel = container.querySelector('.pers-orphans')!
    expect(panel.querySelector('.panel-label')?.textContent).toBe(t.kontenOhnePerson)
    expect(panel.textContent).toContain('wer@example.org')
  })

  it('lassen sich einer Person zuordnen', () => {
    const { container, dispatch } = zeige({ members: WAISE })
    const wahl = container.querySelector<HTMLSelectElement>('.pers-orphans .mem-select')!
    fireEvent.change(wahl, { target: { value: 'p-a' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateMember', userId: 'u9', patch: { personId: 'p-a' },
    })
  })

  it('bietet nur Personen ohne eigenes Konto an', () => {
    /*
      Die Verknüpfung ist eins zu eins gedacht — die ganze Oberfläche
      unterstellt es: Die Konto-Karte nimmt das **erste** passende Mitglied und
      zeigt genau eines, und `send-plan` wie `send-reminders`
      führen je Person genau eine Konto-Id (`userByPerson`).
    */
    const { container } = zeige({
      members: [...WAISE, { userId: 'u8', personId: 'p-a', email: 'a@x.de', planner: false, zuteiler: false }],
    })
    const wahl = container.querySelector<HTMLSelectElement>('.pers-orphans .mem-select')!
    const werte = [...wahl.options].map((o) => o.value)
    expect(werte, 'Person mit Konto steht zur Wahl').not.toContain('p-a')
    // Gegenprobe: die übrigen stehen sehr wohl zur Wahl.
    expect(werte).toContain('p-b')
  })

  it('oder entfernen — erst nach der Rückfrage', () => {
    const { container, dispatch } = zeige({ members: WAISE })
    fireEvent.click(container.querySelector('.pers-orphans .svc-remove')!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'removeMember', userId: 'u9' })
    bestaetigen(container.querySelector('.pers-orphans .svc-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeMember', userId: 'u9' })
  })

  it('das eigene Konto lässt sich nicht entfernen — man sperrte sich selbst aus', () => {
    const { container } = zeige({
      members: [{ userId: 'u1', personId: null, email: 'ich@example.org', planner: true, zuteiler: false }],
      userId: 'u1',
    })
    expect(container.querySelector('.pers-orphans .svc-remove')).toBeNull()
    expect(container.querySelector('.mem-du')?.textContent).toBe(t.duMarker)
  })

  it('gibt es keine, steht die Karte nicht da — ohne Datenbank gibt es nie welche', () => {
    expect(zeige().container.querySelector('.pers-orphans')).toBeNull()
  })
})
