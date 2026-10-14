import { zeitspanne } from '../components/datum-anzeige'
import { personCompare } from '../data/helpers'
import { rechteDerPerson } from '../data/rechte'
import type { Lang, MeetingTime, Member, Person, Reminders } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { wochentagNameAusWd } from '../planen/wochentage'

/*
 * **Was die Einstellungen in ihren Zeilen sagen** (T121, Entwürfe
 * `GEinstellungen`, `GDesktopEinstellungen`) — am Handy rechts in der Zeile,
 * am Desktop unter dem Eintrag links. Beide lesen von hier.
 */

/** „Dienstag 19:00" — der Name des Tages aus `Intl`, in der Sprache des Lesers. */
export function zusammenkunftText(zeit: MeetingTime, lang: Lang): string {
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
