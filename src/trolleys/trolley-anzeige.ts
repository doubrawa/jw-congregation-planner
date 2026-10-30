/**
 * **Wie die Trolleys dastehen** (T121, Phase 7) — Tage, Zeiten und Namen in
 * der Sprache des Lesers. Datum und Wochentag kommen aus `Intl`
 * (`datumsFormat`), nicht aus dem Wörterbuch: Die Termine reichen über die
 * importierten Wochen hinaus.
 */

import type { AppAction } from '../app/context'
import { gebundenesDatum } from '../components/datum-anzeige'
import { displayName, nameVon } from '../data/helpers'
import { fromIso, tagNach } from '../data/meeting-dates'
import { minuten, uhrzeit } from '../data/trolleys'
import type { Lang, Person, Trolley, TrolleyTermin } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

/** Wie viele Wochen man vorausblättern kann: ein Vierteljahr. */
export const TROLLEY_WOCHEN = 13

/** Die sieben Tage einer Woche ab ihrem Montag (ISO). */
export function wochenTage(montag: string): string[] {
  return Array.from({ length: 7 }, (_, i) => tagNach(montag, i))
}

/**
 * Ein Tag ausgeschrieben: „Samstag, 12. September" — die Zahl bleibt bei ihrem
 * Wort (T128: „Montag, 7.|September" über dem Tag der Trolleys bei 320 px).
 * Nicht ganz gebunden wie die Kopfzeile (`kopfzeilenTag`): In der Schrift des
 * Titels ragte „7 de septiembre" am Stück 15 px hinaus.
 */
export function tagLang(datum: string, lang: Lang): string {
  return gebundenesDatum(fromIso(datum), lang, 'tag')
}

/** Ein Tag kurz, für die Zeilen: „Sa., 19. Sept." — Tag und Monat gebunden (T128). */
export function tagKurz(datum: string, lang: Lang): string {
  return gebundenesDatum(fromIso(datum), lang, 'kurzerTag')
}

/** Die Zeit eines Termins: „09:00–11:00". */
export function zeitSpanne(t: Pick<TrolleyTermin, 'von' | 'bis'>): string {
  return `${t.von}–${t.bis}`
}

/** Der andere im Termin, von einem selbst aus gesehen — `null`, wenn man allein steht. */
export function andererIm(termin: Pick<TrolleyTermin, 'pid' | 'partner'>, ich: string | undefined): string | null {
  return termin.pid === ich ? termin.partner : termin.pid
}

/**
 * Wer im Termin steht, für Vorleseprogramme: „Jonas Berger und Simon Krüger"
 * — oder „Jonas Berger sucht einen Partner".
 */
export function werImTermin(
  termin: Pick<TrolleyTermin, 'pid' | 'partner'>,
  persons: readonly Person[],
  t: Pick<Dict, 'trolleyUnd' | 'trolleySuchtPartner'>,
): string {
  const person = nameVon(persons, termin.pid)
  return termin.partner
    ? fill(t.trolleyUnd, { a: person, b: nameVon(persons, termin.partner) })
    : fill(t.trolleySuchtPartner, { name: person })
}

/** „mit Jonas Berger" — oder „Partner gesucht", wo man allein steht. */
export function mitWem(
  termin: Pick<TrolleyTermin, 'pid' | 'partner'>,
  ich: string | undefined,
  persons: readonly Person[],
  t: Pick<Dict, 'trolleyMit' | 'trolleyPartnerGesucht'>,
): string {
  const anderer = andererIm(termin, ich)
  return anderer ? fill(t.trolleyMit, { name: nameVon(persons, anderer) }) : t.trolleyPartnerGesucht
}

/** Der Name eines Trolleys, wie die Versammlung ihn vergeben hat — leer, wenn es ihn nicht mehr gibt. */
export function trolleyNameVon(trolleys: readonly Trolley[], id: string): string {
  return trolleys.find((t) => t.id === id)?.name ?? ''
}

/** Der Name einer Person — leer, wenn es sie nicht (mehr) gibt. Liegt seit dem 30.10.2026 bei `displayName`. */
export { nameVon }

/** Der Vorname — „Jonas hat euch beide eingetragen". */
export function vornameVon(persons: readonly Person[], pid: string | null): string {
  const p = pid ? persons.find((x) => x.id === pid) : undefined
  return p?.fn || (p ? displayName(p) : '')
}

/** Was im Formular „Eintragen" steht (Entwurf `GTrolleyEintragen`). */
export interface Eingabe {
  trolleyId: string
  datum: string
  von: string
  bis: string
  /** „Mit Partner" — sonst „Partner gesucht". */
  mitPartner: boolean
  /** Die Person, die mitkommt (`Person.id`); `null`: noch keine gewählt. */
  partner: string | null
}

/**
 * Das Formular, wie es aufgeht: Trolley und Tag, wie sie gewählt sind, 10 bis
 * 12 Uhr wie im Entwurf — oder der Zeitraum unter einem Tipp —, mit Partner.
 */
export function neueEingabe(trolleyId: string, datum: string, zeit = { von: '10:00', bis: '12:00' }): Eingabe {
  return { trolleyId, datum, ...zeit, mitPartner: true, partner: null }
}

/** Der Tagesplan reicht von 6 bis 22 Uhr. */
const ERSTE_MINUTE = 6 * 60
const PLAN_MINUTEN = (22 - 6) * 60

/** Die vollen Stunden am Rand des Tagesplans: 6 bis 22. */
export const PLAN_STUNDEN: readonly number[] = Array.from({ length: 17 }, (_, i) => 6 + i)

/**
 * Wo eine Uhrzeit im Tagesplan steht, als Anteil seiner Höhe (0 bis 1). In
 * Anteilen und nicht in Pixeln: Die Höhe wächst mit der Schriftstufe, und die
 * kennt nur das Stylesheet.
 */
export function anteilVon(zeit: string): number {
  return (minuten(zeit) - ERSTE_MINUTE) / PLAN_MINUTEN
}

/** Wo ein Termin im Tagesplan steht und wie hoch er ist — beides als Anteil. */
export function lageImPlan(t: Pick<TrolleyTermin, 'von' | 'bis'>): { oben: number; hoehe: number } {
  const oben = anteilVon(t.von)
  return { oben, hoehe: anteilVon(t.bis) - oben }
}

/**
 * Die halbe Stunde unter einem Tipp in den Tagesplan (`anteil` seiner Höhe
 * von oben): abgerundet, frühestens 06:00, spätestens 21:30 — die letzte, an
 * der noch ein Termin beginnen kann.
 */
export function zeitAnStelle(anteil: number): string {
  const halbe = Math.floor(anteil * (PLAN_MINUTEN / 30))
  return uhrzeit(ERSTE_MINUTE + Math.min(Math.max(halbe, 0), PLAN_MINUTEN / 30 - 1) * 30)
}

/** In den Predigtdienst zu den Trolleys — von Start, aus „Meine Aufgaben", aus den Einstellungen. */
export function zuDenTrolleys(dispatch: (action: AppAction) => void): void {
  dispatch({ type: 'setFsBereich', bereich: 'trolleys' })
  dispatch({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
}
