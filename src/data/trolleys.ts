/**
 * **Trolleys** (T121, Phase 7) — reine Logik der App.
 *
 * Die Versammlung legt ihre Trolleys an; wer das Trolley-Recht hat, verabredet
 * sich und trägt sich ein: frei von 6 bis 22 Uhr in halben Stunden, mit
 * Partner oder allein mit „Partner gesucht", und jemand kommt dazu. Niemand
 * plant, niemand sagt zu (Entscheid vom 11.10.2026).
 *
 * Was die Edge Function `trolley` genauso rechnen muss — das Raster der Zeiten,
 * die Überschneidung, wer nach dem Austragen bleibt —, steht im geteilten
 * Edge-Ordner (`_shared/trolley.ts`) und kommt von dort; hier nur, was allein
 * die App fragt.
 *
 * Alle Funktionen sind pur.
 */

import { ueberschneiden, zeitraumGueltig } from '../../supabase/functions/_shared/trolley.ts'
import { isQualified, personCompare } from './helpers'
import { isoDay } from './meeting-dates'
import type { Person, Trolley, TrolleyTermin } from './types'

export { TROLLEY_ZEITEN, zeitraumGueltig } from '../../supabase/functions/_shared/trolley.ts'

/**
 * Der Aufgabenbereich, der zum Eintragen berechtigt (`FesteBereiche.zeugnis`).
 * Der Schlüssel ist geblieben, als aus dem öffentlichen Zeugnisgeben die
 * Trolleys wurden: Er steht in `persons.priv` jeder Person.
 */
export const TROLLEY_RECHT = 'zeugnis'

/** Darf diese Person mit dem Trolley gehen? */
export function darfTrolley(person: Person | undefined): boolean {
  return Boolean(person && isQualified(person, TROLLEY_RECHT))
}

/**
 * Die Trolleys in fester Reihenfolge: nach dem Namen, Zahlen als Zahlen —
 * „Trolley 2" vor „Trolley 10". Die Reihenfolge ordnet auch die Spalten des
 * Tagesplans; wer sie anders will, benennt seine Trolleys um.
 */
export function trolleysSortiert(trolleys: readonly Trolley[]): Trolley[] {
  return [...trolleys].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id.localeCompare(b.id))
}

/** Termine in der Reihenfolge des Tages: Tag, Beginn, Trolley. */
export function termineSortiert(termine: readonly TrolleyTermin[]): TrolleyTermin[] {
  return [...termine].sort(
    (a, b) => a.datum.localeCompare(b.datum) || a.von.localeCompare(b.von) || a.trolleyId.localeCompare(b.trolleyId),
  )
}

/** Steht diese Person in diesem Termin — eingetragen oder als Partner? */
export function istDabei(termin: TrolleyTermin, pid: string | undefined): boolean {
  return pid !== undefined && (termin.pid === pid || termin.partner === pid)
}

/** Die eigenen Termine ab heute, in der Reihenfolge des Tages. */
export function eigeneTermine(termine: readonly TrolleyTermin[], pid: string | undefined, heute = new Date()): TrolleyTermin[] {
  const tag = isoDay(heute)
  return termineSortiert(termine.filter((t) => t.datum >= tag && istDabei(t, pid)))
}

/** Wo andere ab heute einen Partner suchen — die eigenen Termine nicht. */
export function partnerGesucht(termine: readonly TrolleyTermin[], pid: string | undefined, heute = new Date()): TrolleyTermin[] {
  const tag = isoDay(heute)
  return termineSortiert(termine.filter((t) => t.datum >= tag && t.partner === null && t.pid !== pid))
}

/**
 * Warum ein Eintrag nicht ginge — dieselben Gründe, die die Function nennt
 * (`trolley/index.ts`), damit das Blatt sie schon vorher zeigt und nicht erst
 * nach dem Absenden.
 */
export type TrolleyHindernis =
  | 'kein-recht'
  | 'vorbei'
  | 'zeit'
  | 'belegt'
  | 'doppelt'
  | 'partner-doppelt'
  | 'partner-ohne-recht'

/** Was ein neuer Termin werden soll. */
export interface TrolleyWunsch {
  trolleyId: string
  datum: string
  von: string
  bis: string
  /** Der Partner; `null`: „Partner gesucht". */
  partner: Person | null
}

/** Ist die Person zu der Zeit schon irgendwo eingetragen? */
function schonUnterwegs(termine: readonly TrolleyTermin[], pid: string, zeit: Pick<TrolleyTermin, 'datum' | 'von' | 'bis'>): boolean {
  return termine.some((t) => istDabei(t, pid) && ueberschneiden(t, zeit))
}

/**
 * **Was einem Eintrag im Weg steht** — `null`: nichts. In der Reihenfolge, in
 * der man es beheben würde: erst das Recht, dann der Tag, dann die Zeit, dann
 * wer schon wo steht.
 */
export function eintragenHindernis(
  termine: readonly TrolleyTermin[],
  ich: Person | undefined,
  wunsch: TrolleyWunsch,
  heute = new Date(),
): TrolleyHindernis | null {
  if (!ich || !darfTrolley(ich)) return 'kein-recht'
  if (wunsch.datum < isoDay(heute)) return 'vorbei'
  if (!zeitraumGueltig(wunsch.von, wunsch.bis)) return 'zeit'
  if (termine.some((t) => t.trolleyId === wunsch.trolleyId && ueberschneiden(t, wunsch))) return 'belegt'
  if (schonUnterwegs(termine, ich.id, wunsch)) return 'doppelt'
  if (wunsch.partner && !darfTrolley(wunsch.partner)) return 'partner-ohne-recht'
  if (wunsch.partner && schonUnterwegs(termine, wunsch.partner.id, wunsch)) return 'partner-doppelt'
  return null
}

/**
 * Wer mit dem Trolley gehen darf — die Auswahl für „Partner". Die eigene
 * Person nicht; nach dem Nachnamen in der Sprache des Lesers, wie jede
 * Personenliste (`personCompare`).
 */
export function moeglichePartner(persons: readonly Person[], ich: string | undefined, lang: string): Person[] {
  return persons.filter((p) => p.id !== ich && darfTrolley(p)).sort((a, b) => personCompare(a, b, lang))
}

/** Eine Uhrzeit „HH:MM" in Minuten seit Mitternacht. */
export function minuten(zeit: string): number {
  const [h = 0, m = 0] = zeit.split(':').map(Number)
  return h * 60 + m
}

/** Minuten seit Mitternacht als „HH:MM". */
export function uhrzeit(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Wie lang ein neuer Termin vorgeschlagen wird: zwei Stunden, wie im Entwurf. */
const VORSCHLAG_MINUTEN = 120

/**
 * **Der Vorschlag für einen Tipp auf eine freie Zeit** — ab dieser halben
 * Stunde zwei Stunden lang, aber nur bis 22 Uhr und nur bis dahin, wo der
 * nächste Termin dieses Trolleys beginnt. So passt der Vorschlag, und wer
 * länger will, stellt „Bis" selbst.
 */
export function freierZeitraum(
  termine: readonly TrolleyTermin[],
  trolleyId: string,
  datum: string,
  von: string,
): { von: string; bis: string } {
  const anfang = minuten(von)
  const naechster = termine
    .filter((t) => t.trolleyId === trolleyId && t.datum === datum && minuten(t.von) > anfang)
    .reduce((m, t) => Math.min(m, minuten(t.von)), minuten('22:00'))
  return { von, bis: uhrzeit(Math.max(anfang + 30, Math.min(anfang + VORSCHLAG_MINUTEN, naechster))) }
}

/** Die Termine eines Trolleys ab heute — „Belegt" in den Einstellungen und die Rückfrage vor dem Entfernen. */
export function kommendeTermine(termine: readonly TrolleyTermin[], trolleyId: string, heute = new Date()): TrolleyTermin[] {
  const tag = isoDay(heute)
  return termine.filter((t) => t.trolleyId === trolleyId && t.datum >= tag)
}
