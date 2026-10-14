import type { AppState } from '../app/context'
import { zeitspanne } from '../components/datum-anzeige'
import { fsGruppeEntfernen } from '../data/fs'
import { personCompare } from '../data/helpers'
import { rechteDerPerson } from '../data/rechte'
import type { Group, Lang, MeetingTime, Member, Person, Reminders } from '../data/types'
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
 * Der Name einer neuen Gruppe: „Gruppe N" mit der nächsten Zahl — nicht wieder
 * bei 1, wenn „Gruppe 1" und „Gruppe 3" schon stehen. Ein Name ohne Zahl (sie
 * sind frei, entschieden am 11.10.2026) zählt als 0. Gespeichert wird er
 * kanonisch deutsch, angezeigt übersetzt (`tu`).
 */
export function neuerGruppenName(groups: readonly Pick<Group, 'name'>[]): string {
  const hoechste = groups.reduce((m, g) => Math.max(m, Number.parseInt(g.name.replace(/\D/g, ''), 10) || 0), 0)
  return `Gruppe ${hoechste + 1}`
}

/**
 * **Trägt eine andere Gruppe schon diesen Namen?** — so, wie er gespeichert
 * ist, oder so, wie man ihn liest (`tu`: „Gruppe 2" heißt auf Englisch „Group
 * 2"). Groß- und Kleinschreibung und doppelte Leerzeichen zählen nicht, wie
 * bei den Personen (`namensSchluessel`). Gibt die andere Gruppe zurück — der
 * Hinweis nennt sie.
 */
export function gruppenDublette(
  groups: readonly Group[],
  id: string,
  name: string,
  tu: (text: string) => string,
): Group | undefined {
  const schluessel = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()
  const gesucht = schluessel(name)
  if (!gesucht) return undefined
  return groups.find((g) => g.id !== id && (schluessel(g.name) === gesucht || schluessel(tu(g.name)) === gesucht))
}

/** Was mit einer Gruppe verloren geht, je eine Folge. */
export type GruppenFolge = 'mitglieder' | 'treffpunkte' | 'besuche'

/**
 * **Was beim Entfernen einer Gruppe mitgeht** — gefragt wird dieselbe Stelle,
 * die beim Entfernen streicht (`removeGroup`, `fsGruppeEntfernen`). Eine eigene
 * Zählung hier könnte eines Tages Treffpunkte nennen, die gar nicht gehen, oder
 * die verschweigen, die gehen. Eine leere Gruppe ohne Treffpunkte und Besuche
 * hat keine Folgen — erfunden wird keine.
 */
export function gruppenFolgen(
  daten: Pick<AppState, 'persons' | 'fsRules' | 'fsWeeks' | 'gruppenbesuche'>,
  gruppeId: string,
): GruppenFolge[] {
  const folgen: GruppenFolge[] = []
  if (daten.persons.some((p) => p.grp === gruppeId)) folgen.push('mitglieder')
  const rest = fsGruppeEntfernen(daten.fsRules, daten.fsWeeks, gruppeId)
  if (rest.fsRules !== daten.fsRules || rest.fsWeeks !== daten.fsWeeks) folgen.push('treffpunkte')
  if (daten.gruppenbesuche.some((b) => b.grp === gruppeId)) folgen.push('besuche')
  return folgen
}
