/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Was eine Aktion ablehnt, ändert nichts und schreibt nichts** (T120).
 *
 * Jede Aktion der Pläne hat Wege, auf denen sie nichts tun darf: eine volle,
 * vergangene oder falsche Schicht, eine Kennung, die es (nicht mehr) gibt, ein
 * Knopf, für den nichts ansteht. Die Tests der einzelnen Pläne prüften davon
 * nur Stichproben (3.10.2026). Hier steht jeder dieser Wege einmal, mit zwei
 * Fragen:
 *
 * - Kommt **derselbe** Zustand zurück (`toBe`)? Ein neues Objekt mit gleichem
 *   Inhalt rechnet die abgeleiteten Aufgaben neu und zeichnet die Seite neu.
 * - Geht **nichts** an die Datenbank? Das prüft das echte `persist` gegen eine
 *   nachgestellte Datenschicht — auch auf den Wegen, die nur eine Meldung
 *   zeigen und deshalb einen neuen Zustand liefern.
 *
 * Ankommen tun solche Aktionen bei zwei Planern, einem veralteten Knopf oder
 * einem Doppeltipp — mit einer Kennung, die ein anderer gerade gelöscht hat.
 */

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/data', async (importActual) => {
  const echt = await importActual<typeof import('../lib/data')>()
  return Object.fromEntries(
    Object.entries(echt).map(([name, wert]) => [
      name,
      typeof wert === 'function' && /^(save|delete|send|notify|mark|substitute|rename|swap)/.test(name) ? vi.fn() : wert,
    ]),
  )
})

import * as data from '../lib/data'
import { persist } from './persist'
import { reducer } from './reducer'
import type { AppAction, AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_FS_RULES } from '../../tests/testdaten/testdaten'
import { buildFsWeeks } from '../data/fs'
import { besuchEintragen } from '../data/gruppenbesuche'
import { DE as t } from '../i18n/de'
import { fill } from '../i18n/useT'
import type { Gruppenbesuch, OzEintrag, OzTermin, PlanEintrag, WeitererPlan } from '../data/types'

/* Die Uhr steht auf Montag, 7. September 2026. */
const MITTWOCH: OzTermin = { id: 't-mi', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }
const NAECHSTER_MITTWOCH = '2026-09-09'
const LETZTER_MITTWOCH = '2026-09-02'
const oz = (datum: string, pid: string, selbst = false): OzEintrag => ({
  id: `e-${datum}-${pid}`,
  terminId: MITTWOCH.id,
  datum,
  pid,
  selbst,
})
const SAAL: WeitererPlan = { id: 'pl-s', name: 'Winterdienst', von: '2026-09-07', bis: '2026-10-04', entwurf: true }
const WOCHE: PlanEintrag = { id: 'e-woche', planId: 'pl-s', datum: '2026-09-14', grp: 'g1' }
/** Konrad (p5) besucht Gruppe 2 in der zweiten Demo-Woche — und ist dort schon eingetragen. */
const BESUCH: Gruppenbesuch = { id: 'b1', woche: '2026-09-14', grp: 'g2', pid: 'p5' }

/** Simon (p9) ist angemeldet und Planer; er, Manfred (p1) und Konrad (p5) haben den Aufgabenbereich. */
function zustand(over: Partial<AppState> = {}): AppState {
  const demo = demoZustand()
  const kennungen = demo.weeks.map((w) => w.start)
  const persons = demo.persons.map((p) => (['p1', 'p5', 'p9'].includes(p.id) ? { ...p, priv: { ...p.priv, zeugnis: true } } : p))
  return {
    ...demo,
    congregationId: 'c1',
    userId: 'u1',
    planner: true,
    personId: 'p9',
    persons,
    fsWeeks: besuchEintragen(buildFsWeeks(kennungen, DEMO_FS_RULES), kennungen, BESUCH, persons),
    gruppenbesuche: [BESUCH],
    ozTermine: [MITTWOCH],
    ozEintraege: [oz(NAECHSTER_MITTWOCH, 'p1')],
    plaene: [SAAL],
    planEintraege: [WOCHE],
    confirmations: {},
    notifs: [],
    terminGewaehlt: true,
    ...over,
  }
}

/** Die schreibenden Funktionen der Datenschicht, die gerufen wurden — mit Namen. */
function geschrieben(): string[] {
  vi.runOnlyPendingTimers() // gebündelte Schreiber leeren
  return Object.entries(data)
    .filter(([, f]) => vi.isMockFunction(f) && f.mock.calls.length > 0)
    .map(([name]) => name)
}

/** Eine Aktion wie in der App: Reducer, dann persist mit Vorher und Nachher. */
function tue(s: AppState, action: AppAction): AppState {
  const next = reducer(s, action)
  persist(s, next, action)
  return next
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => {
  vi.runOnlyPendingTimers() // die Schreiber sind Modul-Singletons
  vi.useRealTimers()
})

it('Gegenprobe: das Gerüst sieht ein Schreiben — sonst hieße „nichts geschrieben" nichts', () => {
  tue(zustand(), { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p9' })
  expect(geschrieben()).toEqual(['saveOzEintraege'])
})

it('Ausgangslage: Konrad leitet die Treffpunkte von Gruppe 2 in der zweiten Woche schon', () => {
  // Sonst wäre „übernehmen, wo der Besucher schon leitet" aus einem anderen
  // Grund wirkungslos — etwa weil sich die Gruppe in dieser Woche nicht trifft.
  const s = zustand()
  const wi = s.weeks.findIndex((w) => w.start === BESUCH.woche)
  const treffpunkte = s.fsWeeks[wi]!.filter((i) => i.grp === BESUCH.grp)
  expect(treffpunkte.length).toBeGreaterThan(0)
  expect(treffpunkte.every((i) => i.lpid === 'p5')).toBe(true)
})

describe('Abgelehnt: derselbe Zustand, nichts geschrieben', () => {
  const voll = { ozEintraege: [oz(NAECHSTER_MITTWOCH, 'p1'), oz(NAECHSTER_MITTWOCH, 'p5')] }
  const faelle: Array<[was: string, over: Partial<AppState>, action: AppAction]> = [
    // Öffentliches Zeugnisgeben
    ['Zuteilen in eine volle Schicht', voll, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p9' }],
    ['Zuteilen in eine vergangene Schicht', {}, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: LETZTER_MITTWOCH, pid: 'p9' }],
    ['Zuteilen an einem Tag, an dem der Termin nicht ist', {}, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: '2026-09-10', pid: 'p9' }],
    ['Zuteilen zu einem Termin, den es nicht gibt', {}, { type: 'ozZuteilen', terminId: 't-weg', datum: NAECHSTER_MITTWOCH, pid: 'p9' }],
    ['Zuteilen einer Person, die es nicht gibt', {}, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p-weg' }],
    ['Zuteilen derselben Person ein zweites Mal', {}, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p1' }],
    ['Eintragen in einen Termin, den es nicht gibt', { planner: false }, { type: 'ozEintragen', terminId: 't-weg', datum: NAECHSTER_MITTWOCH }],
    ['Eintragen ohne eigene Person', { planner: false, personId: null }, { type: 'ozEintragen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH }],
    ['Austragen eines Eintrags, den es nicht gibt', {}, { type: 'ozAustragen', id: 'e-weg' }],
    ['einen Termin ändern, den es nicht gibt', {}, { type: 'ozTerminUpdate', id: 't-weg', patch: { ort: 'Bahnhof' } }],
    ['einen Termin streichen, den es nicht gibt', {}, { type: 'ozTerminRemove', id: 't-weg' }],
    // Weitere Pläne
    ['einen Plan mit vergebener Kennung anlegen', {}, { type: 'wpPlanAnlegen', plan: { ...SAAL, name: 'Doppelt' } }],
    ['einen Plan ändern, den es nicht gibt', {}, { type: 'wpPlanAendern', id: 'pl-weg', patch: { name: 'X' } }],
    ['einen Zeitraum setzen, der vor seinem Anfang endet', {}, { type: 'wpPlanAendern', id: SAAL.id, patch: { bis: '2026-09-01' } }],
    ['einen Plan löschen, den es nicht gibt', {}, { type: 'wpPlanLoeschen', id: 'pl-weg' }],
    ['Gruppen verteilen in einem Plan, den es nicht gibt', {}, { type: 'wpGruppenVerteilen', planId: 'pl-weg', abGruppe: 'g1' }],
    ['eine Gruppe setzen in einem Plan, den es nicht gibt', {}, { type: 'wpEintragSetzen', planId: 'pl-weg', datum: '2026-09-21', grp: 'g2' }],
    ['dieselbe Gruppe noch einmal setzen', {}, { type: 'wpEintragSetzen', planId: SAAL.id, datum: WOCHE.datum, grp: 'g1' }],
    ['eine leere Woche räumen', {}, { type: 'wpEintragSetzen', planId: SAAL.id, datum: '2026-09-21', grp: null }],
    // Gruppenbesuche
    ['dieselbe Gruppe in derselben Woche ein zweites Mal besuchen', {}, { type: 'besuchHinzufuegen', woche: BESUCH.woche, grp: BESUCH.grp, pid: 'p6' }],
    ['einen Besuch entfernen, den es nicht gibt', {}, { type: 'besuchEntfernen', id: 'b-weg' }],
    ['einen Besucher setzen bei einem Besuch, den es nicht gibt', {}, { type: 'besuchBesucher', id: 'b-weg', pid: 'p6' }],
    ['denselben Besucher noch einmal setzen', {}, { type: 'besuchBesucher', id: BESUCH.id, pid: 'p5' }],
    ['einen Besuch übernehmen, den es nicht gibt', {}, { type: 'besuchUebernehmen', id: 'b-weg' }],
    ['übernehmen, wo der Besucher schon leitet', {}, { type: 'besuchUebernehmen', id: BESUCH.id }],
  ]

  it.each(faelle)('%s', (_was, over, action) => {
    const s = zustand(over)
    expect(tue(s, action)).toBe(s)
    expect(geschrieben()).toEqual([])
  })
})

describe('Nichts zu tun: nur eine Meldung, nichts geschrieben', () => {
  /** Die Teile des Zustands, die ein Plan schreibt. */
  const plandaten = (s: AppState) => ({
    gruppenbesuche: s.gruppenbesuche,
    fsWeeks: s.fsWeeks,
    ozTermine: s.ozTermine,
    ozEintraege: s.ozEintraege,
    plaene: s.plaene,
    planEintraege: s.planEintraege,
    confirmations: s.confirmations,
  })

  const faelle: Array<[was: string, over: Partial<AppState>, action: AppAction, meldung: string]> = [
    [
      'automatisch zuteilen, wenn niemand den Aufgabenbereich hat',
      { persons: demoZustand().persons },
      { type: 'ozAutoAssign' },
      t.toastKeinePassende,
    ],
    [
      'leeren, wenn nur Selbsteingetragenes und Vergangenes da ist',
      { ozEintraege: [oz(LETZTER_MITTWOCH, 'p1'), oz(NAECHSTER_MITTWOCH, 'p9', true)] },
      { type: 'ozLeeren' },
      fill(t.toastGeleertN, { n: 0 }),
    ],
    ['Besuche verteilen ohne Gruppen', { groups: [] }, { type: 'besucheVerteilen', pid: 'p5' }, t.toastKeineBesuche],
    [
      'Besuche leeren, wenn nur Vergangene da sind',
      { gruppenbesuche: [{ id: 'b-alt', woche: '2026-08-31', grp: 'g1', pid: 'p5' }] },
      { type: 'besucheLeeren' },
      fill(t.toastBesucheGeleert, { n: 0 }),
    ],
    ['Gruppen verteilen ohne Gruppen', { groups: [] }, { type: 'wpGruppenVerteilen', planId: SAAL.id, abGruppe: 'g1' }, fill(t.toastWpVerteilt, { n: 0 })],
  ]

  it.each(faelle)('%s', (_was, over, action, meldung) => {
    const s = zustand(over)
    const next = tue(s, action)
    expect(next.toast?.text).toBe(meldung)
    expect(plandaten(next)).toEqual(plandaten(s))
    expect(geschrieben()).toEqual([])
  })
})

describe('Ein zweiter Druck auf denselben Knopf schreibt nichts', () => {
  it('automatisch zuteilen: beim zweiten Mal ist jede Schicht voll', () => {
    const erst = tue(zustand({ ozEintraege: [] }), { type: 'ozAutoAssign' })
    expect(geschrieben()).toEqual(['saveOzEintraege'])
    vi.clearAllMocks()
    const zweit = tue(erst, { type: 'ozAutoAssign' })
    expect(zweit.ozEintraege).toBe(erst.ozEintraege)
    expect(zweit.toast?.text).toBe(t.toastKeinePassende)
    expect(geschrieben()).toEqual([])
  })

  it('Gruppen verteilen: beim zweiten Mal bleibt jede Woche, wie sie ist', () => {
    const erst = tue(zustand(), { type: 'wpGruppenVerteilen', planId: SAAL.id, abGruppe: 'g1' })
    expect(geschrieben()).toEqual(['savePlanEintraege'])
    vi.clearAllMocks()
    const zweit = tue(erst, { type: 'wpGruppenVerteilen', planId: SAAL.id, abGruppe: 'g1' })
    // Dieselben Zeilen in derselben Reihenfolge — nur die Liste ist neu gebaut.
    expect(zweit.planEintraege).toEqual(erst.planEintraege)
    expect(zweit.planEintraege.every((e, i) => e === erst.planEintraege[i])).toBe(true)
    expect(geschrieben()).toEqual([])
  })

  it('Leeren: beim zweiten Mal ist nichts mehr da', () => {
    const erst = tue(zustand(), { type: 'ozLeeren' })
    expect(geschrieben()).toEqual(['saveOzEintraege'])
    vi.clearAllMocks()
    const zweit = tue(erst, { type: 'ozLeeren' })
    expect(zweit.ozEintraege).toBe(erst.ozEintraege)
    expect(zweit.toast?.text).toBe(fill(t.toastGeleertN, { n: 0 }))
    expect(geschrieben()).toEqual([])
  })
})
