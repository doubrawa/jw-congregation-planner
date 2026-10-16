import { describe, expect, it } from 'vitest'
import { KEINE_ABWESENHEIT } from './absence'
import { bedarfJeBereich, engpaesse } from './bedarf'
import { emptyQualifications, privSetzen } from './helpers'
import { assignmentsInMeeting, autoAssignMeeting, rangfolgeFuer } from './planning'
import { kandidaten, type KandidatenDaten } from '../planen/kandidaten'
import { DE } from '../i18n/de'
import type { Meeting, PartSlotSelection, Person, RatgeberSlotSelection, Week } from './types'

/**
 * **Plätze mit eigener Regel** (Review vom 16.10.2026): was dem Vorsitz folgt,
 * der Leiter des Wachtturm-Studiums, der Platz des Kreisaufsehers und der
 * Ratgeber der Zusätzlichen Klasse.
 *
 * Die Automatik kannte die Regeln, die übrigen Fragesteller nicht: Bedarf,
 * Zuteilen-Blatt und die Hinweise „heute schon dran" behandelten diese Plätze
 * wie jeden anderen. Jede Probe hier beschreibt, was vorher falsch zu sehen
 * war. Das Angebot freier Plätze prüfen `offene-plaetze.test.ts` und
 * `substitute-fill.test.ts`.
 */

const person = (id: string, female: boolean, ...bereiche: string[]): Person => {
  const priv = emptyQualifications()
  for (const b of bereiche) privSetzen(priv, b, true)
  return { id, fn: id, ln: 'Test', role: female ? 'verkuendiger' : 'aeltester', female, tel: '', mail: '', priv }
}

const VORSITZ = person('vorsitz', false, 'vorsitzMid')
const ZWEITER = person('zweiter', false, 'vorsitzMid')

const leer = (): Meeting => ({ date: '', end: '', sections: [], helpers: {} })
const woche = (mid: Meeting, we: Meeting = leer()): Week => ({ range: '', book: '', start: '2026-09-07', mid, we })

/**
 * Ein Dienstag nach dem Arbeitsheft ab Januar 2027: Eröffnung mit Vorsitz und
 * Gebet, unter „Uns im Dienst verbessern" eine Besprechung und der „Vortrag des
 * Vorsitzenden" (`ministryNames` im Import legt ihn als Platz „Vorsitz" an).
 */
function dienstag(vorsitz?: Person): Meeting {
  const besetzt = vorsitz ? { name: `${vorsitz.fn} ${vorsitz.ln}`, pid: vorsitz.id } : { name: '' }
  return {
    date: '', end: '', helpers: {},
    sections: [
      { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [
        { iid: 'e1', title: 'Lied 1 und Gebet · Einleitende Worte', names: [
          { ...besetzt, rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
          { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
        ] },
      ] },
      { label: 'UNS IM DIENST VERBESSERN', kind: 'dienst', farbe: 'gold', items: [
        { iid: 'd1', title: 'Platzhalter-Besprechung', names: [{ name: '', bereichsKey: 'besprechung' }] },
        { iid: 'd2', title: 'Platzhalter-Dienst', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }] },
      ] },
    ],
  }
}

const platz = (si: number, ii: number, ni: number, priv: string): PartSlotSelection => ({
  kind: 'part', wi: 0, tab: 'mid', si, ii, ni, priv, groups: false, label: '',
})
const GEBET = platz(0, 0, 1, 'gebet')
const BESPRECHUNG = platz(1, 0, 0, 'besprechung')
const VORTRAG = platz(1, 1, 0, 'vorsitzMid')
const RATGEBER: RatgeberSlotSelection = { kind: 'ratgeber', wi: 0, tab: 'mid', priv: 'ratgeber', groups: false, label: '' }

const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const daten = (weeks: Week[], persons: Person[]): KandidatenDaten => ({
  weeks, persons, lang: 'de', groups: [], services: [], fsWeeks: [], absences: [],
  congregation: { name: 'Test', hall: 'Saal', times: ZEITEN },
})
const liste = (weeks: Week[], persons: Person[], sel: PartSlotSelection | RatgeberSlotSelection) =>
  kandidaten(daten(weeks, persons), sel, KEINE_ABWESENHEIT, DE, (s) => s)

describe('Was dem Vorsitz folgt — Anfangsgebet und Vortrag des Vorsitzenden', () => {
  it('der Bedarf zählt es nicht mit: Wo nur einer den Vorsitz kann, ist das kein Engpass', () => {
    // Bis zum 16.10.2026 zählte der Vortrag als zweiter Bedarf „Vorsitz" und
    // das Anfangsgebet als Bedarf „Gebet" — „nicht besetzbar" in jeder Woche.
    const mid = dienstag()
    const bedarf = bedarfJeBereich(mid, [])
    expect(bedarf.get('vorsitzMid')).toBe(1)
    expect(bedarf.has('gebet')).toBe(false)
    expect(engpaesse(mid, [], [VORSITZ, person('besprecher', false, 'besprechung')], KEINE_ABWESENHEIT, 0, 'mid')).toEqual([])
  })

  it('daran ist der Vorsitz kein „heute schon dran" — an jedem anderen Platz schon', () => {
    const mid = dienstag(VORSITZ)
    expect(assignmentsInMeeting(mid, VORSITZ, [], VORTRAG)).toEqual([])
    expect(assignmentsInMeeting(mid, VORSITZ, [], GEBET)).toEqual([])
    // Gegenprobe: Die Besprechung folgt dem Vorsitz nicht.
    expect(assignmentsInMeeting(mid, VORSITZ, [], BESPRECHUNG)).toHaveLength(1)
  })

  it('das Zuteilen-Blatt schlägt den Vorsitzenden vor und stellt ihn nach oben', () => {
    // Bis dahin schlug es niemanden vor, und der Richtige stand als „heute
    // schon dran" unter einem zweiten Vorsitzenden.
    const kandidatenListe = liste([woche(dienstag(VORSITZ))], [ZWEITER, VORSITZ], VORTRAG)
    expect(kandidatenListe.map((c) => c.key)).toEqual(['vorsitz', 'zweiter'])
    expect(kandidatenListe[0]).toMatchObject({ vorschlag: true, today: [] })
  })

  it('… und folgt dabei der Person am Vorsitz, nicht der Rangfolge', () => {
    // Nach der Rangfolge käme „vorsitz" zuerst (Name), am Vorsitz steht „zweiter".
    const w = woche(dienstag(ZWEITER))
    expect(rangfolgeFuer([w], VORTRAG, [VORSITZ, ZWEITER], [], [], KEINE_ABWESENHEIT).map((p) => p.id)).toEqual(['zweiter'])
  })
})

describe('Der Leiter des Wachtturm-Studiums', () => {
  const sonntag = (): Meeting => ({
    date: '', end: '', helpers: {},
    sections: [{ label: 'WACHTTURM-STUDIUM', kind: 'wtStudium', farbe: 'wein', items: [
      { iid: 'w1', title: 'Platzhalter-Studienartikel', names: [
        { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
        { name: '', rolle: 'Leser', bereichsKey: 'leser' },
      ] },
    ] }],
  })

  it('zählt einmal als offen, wenn ihn niemand leiten kann — nicht zweimal', () => {
    // Schritt 1 sucht ihn zuerst; fand er niemanden, versuchte es Schritt 2
    // noch einmal mit denselben Bewerbern und zählte ihn ein zweites Mal.
    const leser = person('leser', false, 'leser')
    expect(autoAssignMeeting([woche(leer(), sonntag())], 0, 'we', [leser], []).unfilled).toBe(1)
    // Gegenprobe: Mit einem, der das Studium leitet, bleibt nichts offen.
    const leiter = person('leiter', false, 'studium')
    expect(autoAssignMeeting([woche(leer(), sonntag())], 0, 'we', [leser, leiter], []).unfilled).toBe(0)
  })
})

describe('Der Platz des Kreisaufsehers — nur sein Name als Freitext', () => {
  const mitRednerPlatz = (rolle: string): Meeting => ({
    ...leer(),
    sections: [{ label: 'UNSER LEBEN ALS CHRIST', kind: 'lac', farbe: 'wein', items: [
      { iid: 'k1', title: 'Dienstvortrag', names: [{ name: '', rolle, bereichsKey: 'vortrag' }] },
    ] }],
  })
  const SEL: PartSlotSelection = { ...platz(0, 0, 0, 'vortrag'), guest: true }
  const AELTESTER = person('aeltester', false)

  it('das Zuteilen-Blatt bietet keine Person an (16.10.2026)', () => {
    // Bis dahin standen dort die Ältesten und Dienstamtgehilfen wie am
    // Redner-Platz: Ein Tipp machte den Platz zum „Redner", Entfernen danach
    // zum „Gastredner" — der Punkt des Kreisaufsehers war aus der Woche weg.
    expect(liste([woche(mitRednerPlatz('Kreisaufseher'))], [AELTESTER], SEL)).toEqual([])
    // Gegenprobe: Am Platz eines Gastredners bleibt die Liste.
    expect(liste([woche(mitRednerPlatz('Gastredner'))], [AELTESTER], SEL).map((c) => c.key)).toEqual(['aeltester'])
  })
})

describe('Der Ratgeber der Zusätzlichen Klasse — nur Brüder', () => {
  const mitRatgeber = (): Meeting => ({
    ...leer(),
    auxRatgeber: { name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true },
  })
  // Eine Schwester mit versehentlich gesetztem Bereich: Den Schalter an der
  // Person setzt der Admin von Hand, der Platz trägt `male`.
  const SCHWESTER = person('schwester', true, 'ratgeber')
  const BRUDER = person('bruder', false, 'ratgeber')

  it('die Automatik nimmt keine Schwester', () => {
    const allein = autoAssignMeeting([woche(mitRatgeber())], 0, 'mid', [SCHWESTER], [])
    expect(allein.weeks[0]!.mid.auxRatgeber?.pid).toBeUndefined()
    expect(allein.unfilled).toBe(1)
    const beide = autoAssignMeeting([woche(mitRatgeber())], 0, 'mid', [SCHWESTER, BRUDER], [])
    expect(beide.weeks[0]!.mid.auxRatgeber?.pid).toBe('bruder')
  })

  it('das Zuteilen-Blatt bietet sie nicht an und schlägt sie nicht vor', () => {
    const w = woche(mitRatgeber())
    expect(liste([w], [SCHWESTER, BRUDER], RATGEBER).map((c) => c.key)).toEqual(['bruder'])
    expect(rangfolgeFuer([w], RATGEBER, [SCHWESTER, BRUDER], [], [], KEINE_ABWESENHEIT).map((p) => p.id)).toEqual(['bruder'])
  })

  it('der eigene Ratgeber-Platz ist dort kein „heute schon dran"', () => {
    const mid = mitRatgeber()
    mid.auxRatgeber = { ...mid.auxRatgeber!, name: 'bruder Test', pid: 'bruder' }
    expect(assignmentsInMeeting(mid, BRUDER, [], RATGEBER)).toEqual([])
    // Gegenprobe: An jedem anderen Platz steht er als Ratgeber dabei.
    expect(assignmentsInMeeting(mid, BRUDER, [])).toHaveLength(1)
  })
})
