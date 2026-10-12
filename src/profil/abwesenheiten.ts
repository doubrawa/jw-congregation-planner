import type { Absence } from '../data/types'

/**
 * **Die eigenen Abwesenheiten, die anstehen oder gerade laufen** — nach Beginn
 * geordnet. `heute` ist ein ISO-Datum.
 *
 * Seit die Abwesenheiten versammlungsweit geladen werden (die Planung braucht
 * sie), muss hier auf die eigenen eingegrenzt werden. Ohne Konto
 * (Entwicklerseite) gibt es nichts einzugrenzen.
 *
 * **Die Person entscheidet, nicht der Ersteller.** Wer eingetragen hat, ist
 * eine andere Frage als wen es betrifft — und seit es beides getrennt gibt
 * (Import ohne Konto, Planer trägt für andere ein), führt der Ersteller in die
 * Irre: Nach `userId === meiner` stünden dem Planer alle Abwesenheiten der
 * Versammlung als seine eigenen da. Der Ersteller trägt nur noch den Fall,
 * für den er gedacht war: ein Konto **ohne** eigene Person (`personId` null),
 * das seine Einträge sonst nicht wiederfände.
 */
export function eigeneAbwesenheiten(
  absences: readonly Absence[],
  wer: { userId: string | null; personId: string | null },
  heute: string,
): Absence[] {
  const eigene = wer.userId
    ? absences.filter((a) => (a.personId != null ? a.personId === wer.personId : a.userId === wer.userId))
    : absences
  return eigene
    .filter((a) => a.to >= heute)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
}
