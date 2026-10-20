/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { gebundenesDatum } from '../components/datum-anzeige'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import type { Group, Person, PlanEintrag, WeitererPlan } from '../data/types'
import { PlanenScreen } from './PlanenScreen'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Weitere Pläne an der Oberfläche** (T120, Phase 5; T121, Entwürfe
 * `GPlaeneListe`, `GPlaenePlanen`): was der Planer anlegt und einstellt, und
 * was ein Mitglied davon sieht. Die Regeln dahinter prüfen
 * `data/weitere-plaene.test.ts` und `app/weitere-plaene-reducer.test.ts`.
 */

const t = dict('de')

const person = (id: string, fn: string, grp: string | null): Person => ({
  id,
  fn,
  ln: 'Test',
  role: 'verkuendiger',
  female: false,
  tel: '',
  mail: '',
  priv: emptyQualifications(),
  grp,
  fam: null,
})
const ANNA = person('p-a', 'Anna', 'g1')
const CARL = person('p-c', 'Carl', 'g2')
const gruppe = (n: number): Group => ({ id: `g${n}`, name: `Gruppe ${n}`, overseerId: null, assistantId: null })
const GRUPPEN: Group[] = [gruppe(1), gruppe(2)]

const SAAL: WeitererPlan = { id: 'pl-s', name: 'Winterdienst', von: '2026-09-07', bis: '2026-09-27', entwurf: false }
const ENTWURF: WeitererPlan = { ...SAAL, id: 'pl-e', name: 'Grundreinigung', entwurf: true }
const EINTRAEGE: PlanEintrag[] = [
  { id: 'w1', planId: 'pl-s', datum: '2026-09-07', grp: 'g2' },
  { id: 'w2', planId: 'pl-s', datum: '2026-09-14', grp: 'g1' },
  { id: 'w3', planId: 'pl-s', datum: '2026-09-21', grp: 'g2' },
]

function zeige(Screen: () => React.JSX.Element, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    tab: 'wp',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: ANNA.id,
    planner: false,
    persons: [ANNA, CARL],
    groups: GRUPPEN,
    plaene: [SAAL, ENTWURF],
    planEintraege: EINTRAEGE,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Screen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (c: Element, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)
/** Ein Knopf einer `Wahl` — die Gruppe heißt wie ihre Marke. */
const wahlKnopf = (c: Element, wahl: string, text: string) =>
  knopf(c.querySelector(`[role="group"][aria-label="${wahl}"]`)!, text)!
const gedrueckt = (c: Element, wahl: string) =>
  c.querySelector(`[role="group"][aria-label="${wahl}"] [aria-pressed="true"]`)?.textContent
const oeffnen = (c: Element, name: string) =>
  fireEvent.click([...c.querySelectorAll('.wp-plan-zeile')].find((z) => z.textContent?.includes(name))!)
/** Die Gruppen der kommenden Wochen oder Monate in der Vorschau. */
const vorschau = (c: Element) => [...c.querySelectorAll<HTMLSelectElement>('.wp-gruppe-wahl')]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete document.documentElement.dataset.print
})

/** Was im Druckdialog auf dem Bogen steht: sein Titel, je Druck einer. */
function druckeMit(): string[] {
  const titel: string[] = []
  window.print = vi.fn(() => {
    titel.push(document.querySelector('.druck-bogen .druck-titel')?.textContent ?? '')
  })
  return titel
}

describe('Ansehen', () => {
  it('Veröffentlichtes sieht jeder, gleich welcher Gruppe — Entwürfe nie', () => {
    const anna = zeige(ProgrammScreen, { screen: 'programm' }).container
    expect([...anna.querySelectorAll('.wp-name')].map((n) => n.textContent)).toEqual(['Winterdienst'])
    cleanup()
    const carl = zeige(ProgrammScreen, { screen: 'programm', personId: CARL.id }).container
    expect([...carl.querySelectorAll('.wp-name')].map((n) => n.textContent)).toEqual(['Winterdienst'])
  })

  it('„Deine Gruppe ist dran" nennt die Wochen der eigenen Gruppe', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect(container.textContent).toContain(t.wpDeineGruppe)
    expect([...container.querySelectorAll('.wp-chip')].map((c) => c.textContent)).toEqual([zahlBinden('14.–20. September')])
  })

  it('die Woche der eigenen Gruppe ist hervorgehoben — und nichts ist zu bestätigen', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm' })
    expect([...container.querySelectorAll('.wp-liste-zeile.is-eigen')].map((z) => z.textContent)).toEqual([
      `${zahlBinden('14.–20. September')}Gruppe 1`,
    ])
    expect(container.textContent).toContain(t.wpNurInfo)
    expect(knopf(container, t.bestaetigen)).toBeUndefined()
  })

  it('ohne sichtbaren Plan nur der Hinweis', () => {
    const { container } = zeige(ProgrammScreen, { screen: 'programm', plaene: [ENTWURF] })
    expect(container.textContent).toContain(t.wpKeine)
  })

  it('im Monatstakt stehen Monate da — der laufende zuerst, auch bei „Deine Gruppe ist dran"', () => {
    const monate: WeitererPlan = { ...SAAL, von: '2026-08-01', bis: '2026-10-31', takt: 'monat' }
    const { container } = zeige(ProgrammScreen, {
      screen: 'programm',
      plaene: [monate],
      planEintraege: [
        { id: 'm8', planId: 'pl-s', datum: '2026-08-01', grp: 'g2' }, // vorbei
        { id: 'm9', planId: 'pl-s', datum: '2026-09-01', grp: 'g1' },
        { id: 'm10', planId: 'pl-s', datum: '2026-10-01', grp: 'g2' },
      ],
    })
    expect([...container.querySelectorAll('.wp-liste-zeile')].map((z) => z.textContent)).toEqual([
      'September 2026Gruppe 1',
      'Oktober 2026Gruppe 2',
    ])
    expect([...container.querySelectorAll('.wp-chip')].map((c) => c.textContent)).toEqual(['September 2026'])
  })
})

/**
 * Am Handy (Blätter fragen beim Wischen nach der Breite, und jsdom kennt
 * matchMedia nicht); ab dem Tablet stellt ein Test die Breite selbst.
 */
function amHandy() {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })
}

describe('Planen: die Liste', () => {
  amHandy()
  const planen = (over: Partial<AppState> = {}) => zeige(PlanenScreen, { screen: 'planen', planner: true, ...over })

  it('je Stand eine Karte — die Entwürfe zuerst, dann was gilt, dann was war', () => {
    const alt: WeitererPlan = { ...SAAL, id: 'pl-a', name: 'Gartenpflege', von: '2026-03-02', bis: '2026-08-30' }
    const { container } = planen({ plaene: [alt, SAAL, ENTWURF] })
    expect([...container.querySelectorAll('.wp-abschnitt .karte-titel')].map((h) => h.textContent)).toEqual([
      t.wpEntwuerfe,
      t.wpAktuell,
      t.wpAbgeschlossen,
    ])
    expect(container.querySelector('.wp-abschnitt[data-stand="entwurf"]')?.textContent).toContain('Grundreinigung')
  })

  it('unter dem Namen der Ort und, je nach Stand, wann der Plan gilt', () => {
    const winter: WeitererPlan = { ...SAAL, id: 'pl-w', name: 'Schneeräumen', von: '2026-11-30', bis: '2027-02-28' }
    const alt: WeitererPlan = { ...SAAL, id: 'pl-a', name: 'Gartenpflege', von: '2026-03-02', bis: '2026-08-30' }
    const { container } = planen({ plaene: [alt, SAAL, winter] })
    const unter = (name: string) =>
      [...container.querySelectorAll('.wp-plan-zeile')].find((z) => z.textContent?.includes(name))?.querySelector('.klein-text')
        ?.textContent
    expect(unter('Winterdienst')).toBe(zahlBinden(`${t.saal} · bis 27. September 2026`))
    expect(unter('Schneeräumen')).toBe(zahlBinden(`${t.saal} · ab 30. November 2026`))
    expect(unter('Gartenpflege')).toBe(zahlBinden(`${t.saal} · endete am 30. August 2026`))
  })

  it('ein neuer Plan: ohne Wahl als Entwurf angelegt, ab dieser Woche ein Vierteljahr', () => {
    // Dass er danach gleich offen dasteht, prüft `zurueck-am-handy.test.tsx`
    // mit dem echten Speicher; hier nimmt die Attrappe die Aktion nur entgegen.
    const { container, dispatch } = planen()
    fireEvent.click(knopf(container, t.wpNeu)!)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'wpPlanAnlegen',
      plan: { id: expect.stringMatching(/^p.{8,}/), name: '', von: '2026-09-07', bis: '2026-12-06', entwurf: true },
    })
  })

  it('ohne Pläne der Hinweis, und für den Admin „Neuer Plan"', () => {
    const { container } = planen({ plaene: [], planEintraege: [] })
    expect(container.textContent).toContain(t.wpKeine)
    expect(knopf(container, t.wpNeu)).toBeDefined()
  })
})

describe('Planen: ein Plan', () => {
  amHandy()
  const planen = (over: Partial<AppState> = {}) => zeige(PlanenScreen, { screen: 'planen', planner: true, ...over })

  it('die Spur, der Name, eine Woche umsetzen — und am Handy unten „Zurück zum Entwurf"', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Winterdienst')
    expect(container.querySelector('.unteransicht-kopf .seitentitel')?.textContent).toBe(t.wpPlanBearbeiten)
    expect(container.querySelector('.spur [aria-current="step"]')?.textContent).toBe(t.spurVeroeffentlicht)

    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'Winterdienst 2026' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { name: 'Winterdienst 2026' } })

    expect(vorschau(container).map((w) => w.value)).toEqual(['g2', 'g1', 'g2'])
    fireEvent.change(vorschau(container)[1]!, { target: { value: '' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-09-14', grp: null })

    fireEvent.click(knopf(container.querySelector('.planen-leiste')!, t.wpZurueckziehen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { entwurf: true } })
  })

  it('ein Entwurf: „Veröffentlichen" in der Leiste — gesehen wird er erst danach', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Grundreinigung')
    expect(container.querySelector('.spur [aria-current="step"]')?.textContent).toBe(t.wpEntwurf)
    expect(container.textContent).toContain(`${t.wpEntwurfHint} ${t.wpSichtSaal}`)
    expect(container.querySelector('.unteransicht-kopf .aktion-haupt'), 'am Handy nicht auch im Kopf').toBeNull()
    fireEvent.click(container.querySelector('.planen-leiste .aktion-haupt')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-e', patch: { entwurf: false } })
  })

  it('ab dem Tablet steht „Veröffentlichen" neben dem Titel, nicht in einer Leiste', () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('768') })) as unknown as typeof window.matchMedia
    const { container } = planen()
    oeffnen(container, 'Grundreinigung')
    expect(container.querySelector('.unteransicht-kopf .aktion-haupt')?.textContent).toBe(t.wpVeroeffentlichen)
    expect(container.querySelector('.planen-leiste')).toBeNull()
  })

  it('Drucken steht am Handy vorn in der Leiste — gedruckt wird der Bogen des Plans, auch eines Entwurfs', () => {
    const gedruckt = druckeMit()
    const { container } = planen()
    oeffnen(container, 'Grundreinigung')
    const leiste = container.querySelector('.planen-leiste')!
    expect([...leiste.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t.drucken, t.wpVeroeffentlichen])
    fireEvent.click(knopf(leiste, t.drucken)!)
    expect(gedruckt).toEqual(['Grundreinigung'])
  })

  it('ab dem Tablet steht Drucken mit Wort neben dem Titel, vor „Veröffentlichen"', () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('768') })) as unknown as typeof window.matchMedia
    const gedruckt = druckeMit()
    const { container } = planen()
    oeffnen(container, 'Winterdienst')
    const kopf = container.querySelector('.unteransicht-kopf')!
    expect([...kopf.querySelectorAll('button')].map((b) => b.textContent).slice(-2)).toEqual([t.drucken, t.wpZurueckziehen])
    fireEvent.click(knopf(kopf, t.drucken)!)
    expect(gedruckt).toEqual(['Winterdienst'])
  })

  it('„Beginnen mit" verteilt ab dieser Woche — gedrückt ist, womit die Reihe jetzt beginnt', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Winterdienst')
    expect(gedrueckt(container, t.wpAbGruppe)).toBe('Gruppe 2')
    fireEvent.click(wahlKnopf(container, t.wpAbGruppe, 'Gruppe 1'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpGruppenVerteilen', planId: 'pl-s', abGruppe: 'g1' })
  })

  it('ein Tipp auf die gedrückte Gruppe lässt alles, wie es ist — auch Wochen, die von Hand gesetzt sind', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Winterdienst')
    fireEvent.click(wahlKnopf(container, t.wpAbGruppe, 'Gruppe 2'))
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'wpGruppenVerteilen' }))
  })

  it('mehr als vier Gruppen: „Beginnen mit" als Auswahlliste', () => {
    const { container, dispatch } = planen({ groups: [1, 2, 3, 4, 5].map(gruppe) })
    oeffnen(container, 'Winterdienst')
    expect(container.querySelector(`[role="group"][aria-label="${t.wpAbGruppe}"]`)).toBeNull()
    const liste = container.querySelector<HTMLSelectElement>(`select[aria-label="${t.wpAbGruppe}"]`)!
    expect(liste.value).toBe('g2')
    fireEvent.change(liste, { target: { value: 'g5' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpGruppenVerteilen', planId: 'pl-s', abGruppe: 'g5' })
  })

  it('zur Wahl stehen nur Gruppen, die reinigen — eine schon eingetragene bleibt stehen (18.10.2026)', () => {
    // Gruppe 2 ist im Blatt der Reinigung abgeschaltet; diese und die
    // übernächste Woche hat sie noch.
    const { container } = planen({ groups: [gruppe(1), { ...gruppe(2), ohneReinigung: true }, gruppe(3)] })
    oeffnen(container, 'Winterdienst')
    const beginnen = [...container.querySelectorAll(`[role="group"][aria-label="${t.wpAbGruppe}"] button`)]
    expect(beginnen.map((b) => b.textContent)).toEqual(['Gruppe 1', 'Gruppe 3'])
    expect(gedrueckt(container, t.wpAbGruppe), 'die Reihe beginnt bei keiner, die reinigt').toBeUndefined()

    const optionen = (s: HTMLSelectElement) => [...s.options].map((o) => o.value)
    const [diese, naechste] = vorschau(container)
    expect(diese!.value).toBe('g2')
    expect(optionen(diese!)).toEqual(['', 'g1', 'g2', 'g3'])
    expect(optionen(naechste!)).toEqual(['', 'g1', 'g3'])
  })

  it('der Takt ist wählbar — wöchentlich ist vorgegeben', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Winterdienst')
    expect(gedrueckt(container, t.wpTakt)).toBe(t.fsFreqW)
    fireEvent.click(wahlKnopf(container, t.wpTakt, t.fsFreqW))
    expect(dispatch, 'der gedrückte Takt ändert nichts').not.toHaveBeenCalled()
    fireEvent.click(wahlKnopf(container, t.wpTakt, t.wpJedenMonat))
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { takt: 'monat' } })
  })

  it('im Monatstakt: Monate als Zeilen, Hinweis und Vorschau sprechen von Monaten', () => {
    const monate: WeitererPlan = { ...SAAL, von: '2026-09-07', bis: '2026-11-30', takt: 'monat' }
    const { container, dispatch } = planen({
      plaene: [monate],
      planEintraege: [{ id: 'm10', planId: 'pl-s', datum: '2026-10-01', grp: 'g2' }],
    })
    oeffnen(container, 'Winterdienst')
    expect([...container.querySelectorAll('.wp-vorschau-zeile')].map((z) => z.firstChild?.textContent)).toEqual([
      'September 2026',
      'Oktober 2026',
      'November 2026',
    ])
    expect(container.querySelector('.wp-vorschau .karte-titel')?.textContent).toBe(`${t.wpVorschau} · ${zahlBinden('3 Monate')}`)
    expect(container.textContent).toContain(t.wpVerteilenHintMonat)
    expect(vorschau(container).map((z) => z.value)).toEqual(['', 'g2', ''])
    // Eine Zeile meint ihren Monat: gesetzt wird der Monatserste.
    fireEvent.change(vorschau(container)[2]!, { target: { value: 'g1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-11-01', grp: 'g1' })
  })

  it('die Vorschau zeigt die nächsten fünf Wochen — „Alle anzeigen" auch die vergangenen, als Text', () => {
    const lang: WeitererPlan = { ...SAAL, von: '2026-08-24', bis: '2026-11-22' }
    const { container } = planen({
      plaene: [lang],
      planEintraege: [{ id: 'a', planId: 'pl-s', datum: '2026-08-24', grp: 'g1' }],
    })
    oeffnen(container, 'Winterdienst')
    expect(container.querySelector('.wp-vorschau .karte-titel')?.textContent).toBe(`${t.wpVorschau} · ${zahlBinden('13 Wochen')}`)
    expect(container.querySelectorAll('.wp-vorschau-zeile')).toHaveLength(5)
    expect(container.querySelector('.wp-vorschau-zeile.is-vorbei')).toBeNull()

    fireEvent.click(knopf(container, t.alleAnzeigen)!)
    expect(container.querySelectorAll('.wp-vorschau-zeile')).toHaveLength(13)
    const vorbei = [...container.querySelectorAll('.wp-vorschau-zeile.is-vorbei')]
    expect(vorbei).toHaveLength(2)
    expect(vorbei[0]!.textContent).toContain('Gruppe 1')
    expect(vorbei[1]!.textContent).toContain(t.offenDash)
    expect(vorbei.some((z) => z.querySelector('select'))).toBe(false)
    expect(knopf(container, t.alleAnzeigen)).toBeUndefined()
  })

  it('der Zeitraum: „Bis" öffnet den Kalender auf dem Ende — erst „Übernehmen" ändert den Plan', () => {
    const herbst: WeitererPlan = { ...SAAL, bis: '2026-10-25' }
    const { container, dispatch } = planen({ plaene: [herbst] })
    oeffnen(container, 'Winterdienst')
    const [von, bis] = [...container.querySelectorAll<HTMLButtonElement>('.wp-datum')]
    // Kurz, wie im Entwurf: Die Felder stehen nebeneinander. Gebunden (T128):
    // Zahl und Wort brechen nicht auseinander („5 окт. 2026 |г." bei 320 px).
    expect([von!.textContent, bis!.textContent]).toEqual([
      gebundenesDatum(new Date(2026, 8, 7), 'de', 'tagKurzJahr'),
      gebundenesDatum(new Date(2026, 9, 25), 'de', 'tagKurzJahr'),
    ])

    fireEvent.click(bis!)
    const blatt = document.body.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.zeitraumLbl}"]`)!
    expect(blatt.querySelector('.kal-ende[aria-pressed="true"]')?.textContent).toContain(t.bis)
    expect(blatt.querySelector('.kal-monat')?.textContent).toBe('Oktober 2026')
    fireEvent.click(blatt.querySelector('button[aria-label="Sonntag, 1. November"]')!)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'wpPlanAendern' }))

    fireEvent.click(knopf(blatt, t.uebernehmenBtn)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanAendern', id: 'pl-s', patch: { von: '2026-09-07', bis: '2026-11-01' } })
    expect(document.body.querySelector(`[role="dialog"][aria-label="${t.zeitraumLbl}"]`)).toBeNull()
  })

  it('„Abbrechen" lässt den Zeitraum, wie er war — „Übernehmen" ohne Änderung schickt nichts', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Winterdienst')
    const zeitraum = () => document.body.querySelector<HTMLElement>(`[role="dialog"][aria-label="${t.zeitraumLbl}"]`)!

    fireEvent.click(container.querySelector('.wp-datum')!)
    expect(zeitraum().querySelector('.kal-ende[aria-pressed="true"]')?.textContent).toContain(t.von)
    fireEvent.click(zeitraum().querySelector('button[aria-label="Montag, 14. September"]')!)
    fireEvent.click(knopf(zeitraum(), t.abbrechen)!)
    fireEvent.click(container.querySelector('.wp-datum')!)
    fireEvent.click(knopf(zeitraum(), t.uebernehmenBtn)!)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'wpPlanAendern' }))
  })

  it('löschen braucht zwei Tipps', () => {
    const { container, dispatch } = planen()
    oeffnen(container, 'Grundreinigung')
    fireEvent.click(knopf(container, t.wpLoeschen)!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'wpPlanLoeschen', id: 'pl-e' })
    bestaetigen(knopf(container, t.loeschenSicher)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpPlanLoeschen', id: 'pl-e' })
  })

  it('ein abgeschlossener Plan ist gewesen: nichts zu verteilen, zu veröffentlichen oder umzusetzen', () => {
    const alt: WeitererPlan = { ...SAAL, von: '2026-08-03', bis: '2026-08-30' }
    const { container } = planen({
      plaene: [alt],
      planEintraege: [{ id: 'x', planId: 'pl-s', datum: '2026-08-10', grp: 'g1' }],
    })
    oeffnen(container, 'Winterdienst')
    expect(container.querySelector(`[aria-label="${t.wpAbGruppe}"]`)).toBeNull()
    expect(container.querySelector('.planen-leiste')).toBeNull()
    expect(vorschau(container)).toHaveLength(0)
    expect(container.querySelectorAll('.wp-vorschau-zeile.is-vorbei')).toHaveLength(4)
    expect(container.textContent).not.toContain(t.wpSichtSaal)
  })
})

/**
 * **Der Planer plant die Weiteren Pläne wie der Admin** (15.10.2026, „Alles
 * Planen"): anlegen, Name, Zeitraum, Takt, Veröffentlichen, Löschen. Bis dahin
 * verteilte er nur die Gruppen darin.
 */
describe('Der Planer in den Weiteren Plänen (15.10.2026)', () => {
  amHandy()
  const alsPlaner = () => zeige(PlanenScreen, { screen: 'planen', planner: false, zuteiler: true })

  it('legt einen Plan an — und sieht die Entwürfe', () => {
    const { container } = alsPlaner()
    expect(knopf(container, t.wpNeu)).toBeDefined()
    expect(container.textContent).toContain('Grundreinigung')
  })

  it('ändert Name, Zeitraum und Takt, veröffentlicht und verteilt die Gruppen — wie der Admin', () => {
    const { container, dispatch } = alsPlaner()
    oeffnen(container, 'Winterdienst')
    expect(container.querySelector('input[type="text"]')).not.toBeNull()
    expect(container.querySelector('.wp-datum')).not.toBeNull()
    expect(container.querySelector(`[role="group"][aria-label="${t.wpTakt}"]`)).not.toBeNull()
    expect([...container.querySelectorAll('.planen-leiste button')].map((b) => b.textContent)).toEqual([t.drucken, t.wpZurueckziehen])
    expect(knopf(container, t.wpLoeschen)).toBeDefined()

    fireEvent.click(wahlKnopf(container, t.wpAbGruppe, 'Gruppe 1'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpGruppenVerteilen', planId: 'pl-s', abGruppe: 'g1' })
    fireEvent.change(vorschau(container)[0]!, { target: { value: 'g1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'wpEintragSetzen', planId: 'pl-s', datum: '2026-09-07', grp: 'g1' })
  })
})
