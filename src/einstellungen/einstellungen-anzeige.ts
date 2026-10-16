import type { AppState } from '../app/context'
import { zeitspanne } from '../components/datum-anzeige'
import { fsGruppeEntfernen } from '../data/fs'
import { personCompare } from '../data/helpers'
import { rechteDerPerson } from '../data/rechte'
import type { Group, Lang, MeetingTime, Member, Person, Reminders, Trolley } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { wochentagNameAusWd } from '../planen/wochentage'

/*
 * **Was die Einstellungen in ihren Zeilen sagen** (T121, Entwürfe
 * `GEinstellungen`, `GDesktopEinstellungen`) — am Handy rechts in der Zeile,
 * am Desktop unter dem Eintrag links. Beide lesen von hier.
 */

/**
 * „Dienstag 19:00" — der Name des Tages aus `Intl`, in der Sprache des Lesers.
 * Für eine Zusammenkunft ebenso wie für einen Treffpunkt (`FsRule`).
 */
export function zusammenkunftText(zeit: Pick<MeetingTime, 'wd' | 'time'>, lang: Lang): string {
  return `${wochentagNameAusWd(zeit.wd, lang)} ${zeit.time}`
}

type ErinnerungsTexte = Pick<Dict, 'remVorher' | 'remAmTagKurz' | 'remKurz'>

/** Wann eine Erinnerung hinausgeht: „7 Tage vorher", „am Tag" (0). */
export function erinnerungsTag(tage: number, t: Pick<Dict, 'remVorher' | 'remAmTagKurz'>, lang: Lang): string {
  return tage === 0 ? t.remAmTagKurz : fill(t.remVorher, { dauer: zeitspanne(tage, 'day', lang) })
}

/** Der Rhythmus der Erinnerungen in einer Zeile: „Erste 7 Tage vorher, letzte am Tag". */
export function erinnerungKurz(rem: Reminders, t: ErinnerungsTexte, lang: Lang): string {
  return fill(t.remKurz, { erste: erinnerungsTag(rem.first, t, lang), letzte: erinnerungsTag(rem.last, t, lang) })
}

/**
 * **Wer plant**: alle, die planen dürfen, und die Admins — das Konto
 * entscheidet, ohne Konto die Vormerkung (`rechteDerPerson`, wie bei der
 * Person). Nach dem Namen geordnet, wie die Personenliste.
 */
export function werPlant(persons: readonly Person[], members: readonly Member[], lang: Lang): Person[] {
  return persons
    .filter((p) => {
      const rechte = rechteDerPerson(members, p)
      return rechte.admin || rechte.planer
    })
    .sort((a, b) => personCompare(a, b, lang))
}

/**
 * Die Zahl nach der höchsten in den Namen — nicht wieder 1, wenn „Gruppe 1"
 * und „Gruppe 3" schon stehen. Jede Zahl eines Namens zählt für sich; ein Name
 * ohne Zahl (sie sind frei, entschieden am 11.10.2026) zählt als 0. Bis zum
 * 16.10.2026 wurden die Ziffern eines Namens aneinandergehängt: Aus
 * „Gruppe 1 (Nord 2)" wurde 12, und die nächste hieß „Gruppe 13".
 */
function naechsteZahl(liste: readonly { name: string }[]): number {
  return liste.reduce((m, x) => Math.max(m, ...(x.name.match(/\d+/g) ?? []).map(Number)), 0) + 1
}

/**
 * Der Name einer neuen Gruppe: „Gruppe N" mit der nächsten Zahl. Gespeichert
 * wird er kanonisch deutsch, angezeigt übersetzt (`tu`).
 */
export function neuerGruppenName(groups: readonly Pick<Group, 'name'>[]): string {
  return `Gruppe ${naechsteZahl(groups)}`
}

/**
 * Der Name eines neuen Trolleys: das Wort der Oberfläche (`wort`, „Trolley")
 * mit der nächsten Zahl. Anders als die Gruppe wird er nicht übersetzt — die
 * Versammlung nennt ihre Trolleys, wie sie will, und so steht er da.
 */
export function neuerTrolleyName(trolleys: readonly Pick<Trolley, 'name'>[], wort: string): string {
  return `${wort} ${naechsteZahl(trolleys)}`
}

/**
 * **Trägt schon ein anderer Eintrag diesen Namen?** — so, wie er gespeichert
 * ist, oder so, wie man ihn liest (`lesen`, bei Gruppen `tu`: „Gruppe 2" heißt
 * auf Englisch „Group 2"). Groß- und Kleinschreibung und doppelte Leerzeichen
 * zählen nicht, wie bei den Personen (`namensSchluessel`). Gibt den anderen
 * zurück — der Hinweis nennt ihn.
 */
export function doppelterName<T extends { id: string; name: string }>(
  liste: readonly T[],
  id: string,
  name: string,
  lesen: (text: string) => string = (text) => text,
): T | undefined {
  const schluessel = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()
  const gesucht = schluessel(name)
  if (!gesucht) return undefined
  return liste.find((x) => x.id !== id && (schluessel(x.name) === gesucht || schluessel(lesen(x.name)) === gesucht))
}

/** Was mit einer Gruppe verloren geht, je eine Folge. */
export type GruppenFolge = 'mitglieder' | 'treffpunkte' | 'besuche' | 'plaene'

/**
 * **Was beim Entfernen einer Gruppe mitgeht** — gefragt wird dieselbe Stelle,
 * die beim Entfernen streicht (`removeGroup`, `fsGruppeEntfernen`). Eine eigene
 * Zählung hier könnte eines Tages Treffpunkte nennen, die gar nicht gehen, oder
 * die verschweigen, die gehen. Eine leere Gruppe ohne Treffpunkte und Besuche
 * hat keine Folgen — erfunden wird keine.
 */
export function gruppenFolgen(
  daten: Pick<AppState, 'persons' | 'fsRules' | 'fsWeeks' | 'gruppenbesuche' | 'planEintraege'>,
  gruppeId: string,
): GruppenFolge[] {
  const folgen: GruppenFolge[] = []
  if (daten.persons.some((p) => p.grp === gruppeId)) folgen.push('mitglieder')
  const rest = fsGruppeEntfernen(daten.fsRules, daten.fsWeeks, gruppeId)
  if (rest.fsRules !== daten.fsRules || rest.fsWeeks !== daten.fsWeeks) folgen.push('treffpunkte')
  if (daten.gruppenbesuche.some((b) => b.grp === gruppeId)) folgen.push('besuche')
  // Ihre Zeiträume in den weiteren Plänen bleiben, nur ohne Gruppe (`removeGroup`).
  if (daten.planEintraege.some((e) => e.grp === gruppeId)) folgen.push('plaene')
  return folgen
}
